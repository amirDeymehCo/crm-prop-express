const UserChallenge = require("../../models/Challenge/UserChallenge");
const AccountInstance = require("../../models/Challenge/AccountInstance");
const HistoryChallenge = require("../../models/Challenge/HistoryChallenge");
const ChallengeRecovery = require("../../models/ChallengeRecovery");
const Order = require("../../models/Order");

const {
  RECOVERY_STATUS,
  RECOVERY_ORDER_TYPE,
  PHASE_TITLE,
  REVIVE_ON_FIRST_INSTALLMENT,
} = require("./constants");

const {
  round2,
  parseJsonField,
  phaseStatusFor,
  findPhaseId,
} = require("./helpers");
const { createRecoveryOrder } = require("./createOffer");

/**
 * احیای چالش و حساب.
 *
 * برخلاف مسیر بیمه، اینجا چالش جدیدی ساخته نمی‌شود: همان UserChallenge از
 * closed به وضعیت فازی که در آن رد شده برمی‌گردد و همان AccountInstance
 * (همان mt_login) دوباره active می‌شود.
 *
 * ریست واقعی بالانس روی پلتفرم معاملاتی کار سرویس PHP است؛ ما فقط ستون‌های
 * نمایشی خودمان را هم‌راستا می‌کنیم و بعد از commit به آن‌ها خبر می‌دهیم.
 */
async function reviveChallenge({ recovery, transaction }) {
  const userChallenge = await UserChallenge.findByPk(
    recovery.user_challenge_id,
    { transaction, lock: transaction.LOCK.UPDATE },
  );

  if (!userChallenge) {
    throw Object.assign(new Error("چالش این بازیابی پیدا نشد"), {
      status: 400,
    });
  }

  const account = recovery.account_instance_id
    ? await AccountInstance.findByPk(recovery.account_instance_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
    : null;

  const phaseIndex = Number(recovery.phase_index || 1);

  const phaseId = await findPhaseId({
    planId: userChallenge.challenge_plan_id,
    phaseIndex,
    transaction,
  });

  await userChallenge.update(
    {
      status: phaseStatusFor(phaseIndex),
      current_phase_index: phaseIndex,
      current_phase_id: phaseId || userChallenge.current_phase_id,
      current_account_instance_id:
        account?.id || userChallenge.current_account_instance_id,
      ended_at: null,
    },
    { transaction },
  );

  if (account) {
    const startingBalance = Number(account.starting_balance_usd || 0);

    await account.update(
      {
        status: "active",
        display_balance_usd: startingBalance,
        display_equity_usd: startingBalance,
        closed_at: null,
        activated_at: new Date(),
      },
      { transaction },
    );
  }

  return { userChallenge, account };
}

/**
 * بعد از موفق شدن پرداخت یک سفارشِ بازیابی صدا زده می‌شود.
 *
 * idempotent است: اگر سفارش از قبل paid باشد (کال‌بک تکراری درگاه) هیچ کاری
 * دوباره انجام نمی‌شود.
 *
 * @param {object} params
 * @param {object} params.order       سفارشِ قفل‌شده‌ی بازیابی
 * @param {object} params.transaction
 * @param {string} [params.trackingCode]
 * @param {string} [params.refNum]
 * @returns {Promise<{alreadyDone:boolean, recovery_id?:number, revived?:boolean, notify?:boolean}>}
 */
async function finalizeRecoveryAfterPaid({
  order,
  transaction,
  trackingCode = null,
  refNum = null,
}) {
  if (!order) {
    throw Object.assign(new Error("سفارش بازیابی ارسال نشده است"), {
      status: 400,
    });
  }

  if (order.status === "paid") {
    return { alreadyDone: true };
  }

  // اتصال از روی order_group_id است نه meta: ستون meta در این دیتابیس
  // longtext است و پارس‌نشده برمی‌گردد. meta فقط fallback است.
  let recovery = order.order_group_id
    ? await ChallengeRecovery.findOne({
        where: { order_group_id: order.order_group_id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
    : null;

  if (!recovery) {
    const fallbackId = parseJsonField(order.meta)?.recovery_id;

    recovery = fallbackId
      ? await ChallengeRecovery.findByPk(fallbackId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : null;
  }

  if (!recovery) {
    throw Object.assign(
      new Error("این سفارش به هیچ رکورد بازیابی وصل نیست"),
      { status: 400 },
    );
  }

  if (
    recovery.status === RECOVERY_STATUS.CANCELLED ||
    recovery.status === RECOVERY_STATUS.EXPIRED
  ) {
    throw Object.assign(
      new Error("این فاکتور بازیابی دیگر معتبر نیست"),
      { status: 409 },
    );
  }

  const paidUsd = round2(order.final_amount_usd ?? order.amount_usd ?? 0);
  const isInstallment = recovery.payment_plan === "installment";
  const installmentNumber = Number(order.installment_number || 0);
  const isSecond = isInstallment && installmentNumber === 2;

  await order.update(
    {
      status: "paid",
      paid_at: new Date(),
      gateway_payment_id: refNum || order.gateway_payment_id,
      meta: {
        ...(parseJsonField(order.meta) || {}),
        tracking_code: trackingCode,
        ref_num: refNum,
      },
    },
    { transaction },
  );

  const newPaidTotal = round2(Number(recovery.paid_amount_usd || 0) + paidUsd);

  const fullyPaid = !isInstallment || isSecond;

  const update = {
    paid_amount_usd: newPaidTotal,
    status: fullyPaid
      ? RECOVERY_STATUS.PAID
      : RECOVERY_STATUS.PARTIALLY_PAID,
  };

  if (isSecond) {
    update.second_paid_at = new Date();
  } else if (!recovery.first_paid_at) {
    update.first_paid_at = new Date();
  }

  if (fullyPaid) {
    update.paid_at = new Date();
  }

  await recovery.update(update, { transaction });
  await recovery.reload({ transaction });

  // قسط دوم: همین‌جا فاکتورش را می‌سازیم تا کاربر و پنل PHP ببینندش
  let secondOrder = null;

  if (isInstallment && !isSecond && recovery.second_amount_usd != null) {
    const existingSecond = await Order.findOne({
      where: {
        order_group_id: recovery.order_group_id,
        type: RECOVERY_ORDER_TYPE,
        installment_number: 2,
      },
      transaction,
    });

    secondOrder =
      existingSecond ||
      (await createRecoveryOrder({
        recovery,
        installmentNumber: 2,
        amountUsd: round2(recovery.second_amount_usd),
        amountIrr: Math.round(Number(recovery.second_amount_irr || 0)),
        gateway: order.gateway === "wallet" ? "peykan" : order.gateway,
        transaction,
      }));
  }

  // احیا فقط یک بار اتفاق می‌افتد
  const shouldRevive =
    !recovery.revived_at && (fullyPaid || REVIVE_ON_FIRST_INSTALLMENT);

  let revived = false;

  if (shouldRevive) {
    await reviveChallenge({ recovery, transaction });

    await recovery.update({ revived_at: new Date() }, { transaction });

    revived = true;
  }

  const phaseTitle = PHASE_TITLE[Number(recovery.phase_index)] || "—";

  await HistoryChallenge.create(
    {
      user_challenge_id: recovery.user_challenge_id,
      type: "recovery_paid",
      title:
        `پرداخت بازیابی حساب ${recovery.mt_login} به مبلغ ${paidUsd} دلار` +
        (isInstallment ? ` (قسط ${isSecond ? "دوم" : "اول"})` : "") +
        (revived ? ` — حساب در ${phaseTitle} احیا شد` : "") +
        (fullyPaid ? "" : " — فاکتور قسط دوم ساخته شد"),
    },
    { transaction },
  );

  return {
    alreadyDone: false,
    recovery_id: recovery.id,
    user_challenge_id: recovery.user_challenge_id,
    mt_login: recovery.mt_login,
    phase_index: recovery.phase_index,
    paid_amount_usd: paidUsd,
    fully_paid: fullyPaid,
    revived,
    // اطلاع‌رسانی به PHP باید بعد از commit انجام شود
    notify: revived,
    second_order_id: secondOrder?.id ?? null,
  };
}

module.exports = { finalizeRecoveryAfterPaid, reviveChallenge };
