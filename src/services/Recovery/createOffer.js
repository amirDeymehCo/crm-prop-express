const { randomUUID } = require("crypto");

const sequelize = require("../../../db");
const Order = require("../../models/Order");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const HistoryChallenge = require("../../models/Challenge/HistoryChallenge");
const ChallengeRecovery = require("../../models/ChallengeRecovery");

const {
  RECOVERY_STATUS,
  RECOVERY_ORDER_TYPE,
  RECOVERABLE_CHALLENGE_STATUS,
  PHASE_TITLE,
} = require("./constants");

const {
  round2,
  parseJsonField,
  getDollarPrice,
  buildRecoveryPricing,
  getLastGateway,
  findAccountByLogin,
} = require("./helpers");

const {
  buildFallbackPlanMatcher,
  needsFallbackPlan,
  resolveChallengePricing,
} = require("./pricing");

/**
 * فاکتور یک قسط (یا کل مبلغ در پرداخت یکجا).
 */
async function createRecoveryOrder({
  recovery,
  installmentNumber,
  amountUsd,
  amountIrr,
  gateway,
  transaction,
}) {
  return Order.create(
    {
      user_id: recovery.user_id,
      user_challenge_id: recovery.user_challenge_id,

      type: RECOVERY_ORDER_TYPE,
      gateway,
      status: "pending",
      currency: "USD",
      gateway_order_id: `recovery-${recovery.id}-${installmentNumber}-${Date.now()}`,

      payment_plan: recovery.payment_plan,
      installment_number:
        recovery.payment_plan === "installment" ? installmentNumber : 0,
      order_group_id: recovery.order_group_id,
      payment_attempt_number: 1,

      base_amount_usd: amountUsd,
      base_amount_irr: amountIrr,

      insurance_amount_usd: 0,
      insurance_amount_irr: 0,

      discount_usd: 0,
      discount_irr: 0,

      amount_usd: amountUsd,
      amount_irr: amountIrr,

      final_amount_usd: amountUsd,
      final_amount_irr: amountIrr,

      meta: {
        challenge_recovery: true,
        recovery_id: recovery.id,
        mt_login: recovery.mt_login,
        phase_index: recovery.phase_index,
        installment_number: installmentNumber,
        external_ref: recovery.external_ref,
      },
    },
    { transaction },
  );
}

/**
 * باطل کردن پیشنهادهای بازِ قبلی همین چالش به‌همراه سفارش‌های پرداخت‌نشده‌شان.
 *
 * فقط پیشنهادهایی که هنوز هیچ پولی برایشان پرداخت نشده باطل می‌شوند؛ پیشنهاد
 * نیمه‌پرداخت (قسط اول داده‌شده) جلوتر با خطای ۴۰۹ رد می‌شود.
 */
async function cancelOpenOffers({ userChallengeId, reason, transaction }) {
  const open = await ChallengeRecovery.findAll({
    where: {
      user_challenge_id: userChallengeId,
      status: RECOVERY_STATUS.PENDING_PAYMENT,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  for (const rec of open) {
    await rec.update(
      {
        status: RECOVERY_STATUS.CANCELLED,
        cancelled_at: new Date(),
        meta: { ...(parseJsonField(rec.meta) || {}), cancel_reason: reason },
      },
      { transaction },
    );

    await Order.update(
      { status: "cancelled" },
      {
        where: {
          user_challenge_id: userChallengeId,
          type: RECOVERY_ORDER_TYPE,
          status: "pending",
          order_group_id: rec.order_group_id,
        },
        transaction,
      },
    );
  }

  return open.map((r) => r.id);
}

/**
 * ساخت فاکتور «بازیابی حساب».
 *
 * ادمین سمت PHP بعد از تماس فروش مبلغ جدید را ثبت می‌کند و این متد صدا زده
 * می‌شود. اگر قبلاً فاکتور پرداخت‌نشده‌ای برای همین چالش باز بوده، باطل و
 * فاکتور جدید جایش ساخته می‌شود.
 *
 * @param {object} params
 * @param {string} params.mt_login
 * @param {number} params.offer_price_usd  کل مبلغ قابل پرداخت به دلار
 * @param {string} [params.external_ref]   شناسه‌ی این پیشنهاد در سیستم PHP
 * @param {string} [params.agent]          کارشناس فروش
 * @param {string} [params.note]
 * @param {string} [params.expires_at]     ISO date
 * @param {string} [params.payment_plan]   پیش‌فرض: ارث‌بری از چالش قبلی
 */
async function createRecoveryOffer({
  mt_login,
  offer_price_usd,
  external_ref = null,
  agent = null,
  note = null,
  expires_at = null,
  payment_plan = null,
}) {
  const offerUsd = round2(offer_price_usd);

  if (!Number.isFinite(offerUsd) || offerUsd <= 0) {
    throw Object.assign(new Error("مبلغ پیشنهادی باید بزرگ‌تر از صفر باشد"), {
      status: 400,
    });
  }

  const t = await sequelize.transaction();

  try {
    const account = await findAccountByLogin(String(mt_login).trim(), t);

    if (!account) {
      throw Object.assign(new Error("حسابی با این لاگین پیدا نشد"), {
        status: 404,
        code: "account_not_found",
      });
    }

    const userChallenge = await UserChallenge.findByPk(
      account.user_challenge_id,
      { transaction: t, lock: t.LOCK.UPDATE },
    );

    if (!userChallenge) {
      throw Object.assign(new Error("چالش این حساب پیدا نشد"), {
        status: 404,
        code: "challenge_not_found",
      });
    }

    if (userChallenge.status !== RECOVERABLE_CHALLENGE_STATUS) {
      throw Object.assign(
        new Error("این چالش رد نشده است و قابل بازیابی نیست"),
        { status: 409, code: "challenge_not_closed" },
      );
    }

    // پیشنهاد نیمه‌پرداخت را نباید با فاکتور جدید جایگزین کرد؛ کاربر قسط اول
    // را داده و حسابش احیا شده است.
    const inProgress = await ChallengeRecovery.findOne({
      where: {
        user_challenge_id: userChallenge.id,
        status: RECOVERY_STATUS.PARTIALLY_PAID,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (inProgress) {
      throw Object.assign(
        new Error(
          `برای این حساب فاکتور بازیابی نیمه‌پرداخت شماره ${inProgress.id} وجود دارد؛ ابتدا تعیین تکلیف شود`,
        ),
        {
          status: 409,
          code: "recovery_in_progress",
          recovery_id: inProgress.id,
        },
      );
    }

    const cancelledIds = await cancelOpenOffers({
      userChallengeId: userChallenge.id,
      reason: "replaced_by_new_offer",
      transaction: t,
    });

    const plan = await ChallengePlan.findByPk(userChallenge.challenge_plan_id, {
      transaction: t,
    });

    // قیمت قبلی را از هر منبعی که در دسترس است بازسازی می‌کنیم؛ برای
    // سفارش‌های دستیِ مهاجرت‌شده از روی تایپ + بالانس حساب.
    const matchPlan = needsFallbackPlan({ userChallenge, plan })
      ? await buildFallbackPlanMatcher(
          [
            {
              challengeTypeId: Number(userChallenge.challenge_type_id),
              balanceUsd: Number(account.starting_balance_usd || 0),
            },
          ],
          t,
        )
      : null;

    const purchaseOrders = await Order.findAll({
      where: { user_challenge_id: userChallenge.id, status: "paid" },
      attributes: [
        "id",
        "type",
        "gateway",
        "amount_usd",
        "discount_usd",
        "final_amount_usd",
        "coupon_code_snapshot",
        "paid_at",
      ],
      order: [["id", "DESC"]],
      transaction: t,
    });

    const previousPricing = resolveChallengePricing({
      userChallenge,
      plan,
      account,
      paidOrders: purchaseOrders,
      matchPlan,
    });

    const dollarPrice = await getDollarPrice(t);

    const planMode =
      payment_plan === "full" || payment_plan === "installment"
        ? payment_plan
        : userChallenge.payment_plan === "installment"
          ? "installment"
          : "full";

    const pricing = buildRecoveryPricing({
      offerPriceUsd: offerUsd,
      paymentPlan: planMode,
      dollarPrice,
    });

    const phaseIndex = Number(
      account.phase_index || userChallenge.current_phase_index || 1,
    );

    const recovery = await ChallengeRecovery.create(
      {
        user_id: userChallenge.user_id,
        user_challenge_id: userChallenge.id,
        account_instance_id: account.id,
        mt_login:
          account.mt_login || account.platform_login || String(mt_login),
        phase_index: phaseIndex,

        status: RECOVERY_STATUS.PENDING_PAYMENT,
        payment_plan: planMode,

        previous_price_usd: previousPricing.original_price_usd,
        offer_price_usd: pricing.totalUsd,
        offer_price_irr: pricing.totalIrr,

        first_amount_usd: pricing.first.totalUsd,
        first_amount_irr: pricing.first.totalIrr,
        second_amount_usd: pricing.second?.totalUsd ?? null,
        second_amount_irr: pricing.second?.totalIrr ?? null,

        order_group_id: randomUUID(),
        external_ref,
        agent_label: agent,
        note,
        expires_at: expires_at ? new Date(expires_at) : null,

        meta: {
          dollar_price_at_offer: dollarPrice,
          replaced_recovery_ids: cancelledIds,
          platform: account.platform,
          // ردِ اینکه «قیمت قبلی» از کجا آمده — برای سفارش‌های دستی مهم است
          previous_price_source: previousPricing.price_source,
          previous_list_total_usd: previousPricing.list_total_usd,
          previous_paid_total_usd: previousPricing.paid_total_usd,
          previous_paid_source: previousPricing.paid_source,
          previous_price_is_estimated: previousPricing.is_estimated,
        },
      },
      { transaction: t },
    );

    const gateway = await getLastGateway(userChallenge.id, t);

    const order = await createRecoveryOrder({
      recovery,
      installmentNumber: 1,
      amountUsd: pricing.first.totalUsd,
      amountIrr: pricing.first.totalIrr,
      gateway,
      transaction: t,
    });

    await HistoryChallenge.create(
      {
        user_challenge_id: userChallenge.id,
        type: "recovery_offer_created",
        title:
          `فاکتور بازیابی حساب ${recovery.mt_login} (${PHASE_TITLE[phaseIndex] || "—"}) ` +
          `به مبلغ ${pricing.totalUsd} دلار ثبت شد` +
          (planMode === "installment"
            ? ` در دو قسط ${pricing.first.totalUsd} و ${pricing.second.totalUsd} دلاری`
            : " (یکجا)") +
          (agent ? ` — کارشناس: ${agent}` : "") +
          (cancelledIds.length
            ? ` — فاکتور قبلی شماره ${cancelledIds.join(", ")} باطل شد`
            : ""),
      },
      { transaction: t },
    );

    await t.commit();

    return {
      recovery_id: recovery.id,
      user_challenge_id: userChallenge.id,
      user_id: userChallenge.user_id,
      mt_login: recovery.mt_login,
      phase_index: phaseIndex,
      status: recovery.status,
      payment_plan: planMode,
      previous_price_usd: round2(recovery.previous_price_usd),
      previous_price_source: previousPricing.price_source,
      previous_list_total_usd: previousPricing.list_total_usd,
      previous_paid_total_usd: previousPricing.paid_total_usd,
      previous_price_is_estimated: previousPricing.is_estimated,
      offer_price_usd: pricing.totalUsd,
      offer_price_irr: pricing.totalIrr,
      first_amount_usd: pricing.first.totalUsd,
      second_amount_usd: pricing.second?.totalUsd ?? null,
      expires_at: recovery.expires_at,
      external_ref: recovery.external_ref,
      cancelled_recovery_ids: cancelledIds,
      order: {
        id: order.id,
        gateway_order_id: order.gateway_order_id,
        amount_usd: Number(order.final_amount_usd),
        amount_irr: Number(order.final_amount_irr),
      },
    };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

module.exports = { createRecoveryOffer, createRecoveryOrder, cancelOpenOffers };
