const { randomUUID } = require("crypto");

const sequelize = require("../../../db");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../models/Challenge/ChallengePhase");
const UserChallengeRisk = require("../../models/UserChallengeRisk");
const HistoryChallenge = require("../../models/Challenge/HistoryChallenge");
const Order = require("../../models/Order");

const {
  INSURANCE_STATUS,
  INSURANCE_EVENT_TYPE,
  PHASE_TITLE,
} = require("./constants");

const {
  getDollarPrice,
  getBasePriceUsd,
  getPaidBaseUsd,
  buildReloadPricing,
  getLastGateway,
  getFailedAccount,
  describeAccount,
  buildInsuranceOrigin,
  buildReloadSnapshot,
} = require("./helpers");

async function logInsuranceEvent({
  userChallengeId,
  phaseIndex,
  title,
  adminId = null,
  transaction,
}) {
  await HistoryChallenge.create(
    {
      user_challenge_id: userChallengeId,
      admin_id: adminId,
      type: INSURANCE_EVENT_TYPE[Number(phaseIndex)] ?? "insurance_paid",
      title,
    },
    { transaction },
  );
}

async function createReplacementChallenge({
  sourceChallenge,
  plan,
  phase1,
  pricing,
  snapshot,
  paymentPlan,
  dollarPrice,
  adminId,
  platform,
  transaction,
}) {
  const startingBalance = Number(plan.balance);

  const remainingUsd =
    paymentPlan === "installment"
      ? Number(pricing.second.totalUsd)
      : Number(pricing.payableUsd);

  return UserChallenge.create(
    {
      user_id: sourceChallenge.user_id,
      admin_id: adminId ?? null,
      challenge_plan_id: plan.id,
      challenge_type_id: plan.challenge_type_id,

      status: "pending_payment",
      current_phase_index: 1,
      current_phase_id: phase1.id,
      challenge_phase: phase1.id,

      starting_balance_usd: startingBalance,
      display_balance_usd: startingBalance,

      // چالش جایگزین دیگر بیمه ندارد
      has_insurance: false,
      insurance_fee_usd: null,
      insurance_status: INSURANCE_STATUS.NONE,

      price_usd: pricing.baseUsd,
      discount_usd: pricing.discountUsd,
      final_price_usd: pricing.payableUsd,

      floating_risk_fee_usd: Number(sourceChallenge.floating_risk_fee_usd || 0),
      floating_risk_enabled: Boolean(sourceChallenge.floating_risk_enabled),
      floating_risk_type: sourceChallenge.floating_risk_type,
      floating_risk_value: sourceChallenge.floating_risk_value,
      floating_risk_base_on: sourceChallenge.floating_risk_base_on,
      floating_risk_max_risk_usd: sourceChallenge.floating_risk_max_risk_usd,

      rules_snapshot: snapshot,
      platform: platform || sourceChallenge.platform || "ctrader",

      payment_plan: paymentPlan,
      payment_status: "pending_first_payment",

      total_price_usd: pricing.payableUsd,
      total_price_irr: pricing.payableIrr,

      remaining_amount_usd: remainingUsd,
      remaining_amount_irr: Math.round(remainingUsd * (dollarPrice) * 10),
    },
    { transaction },
  );
}

async function copyFloatingRisk({
  sourceChallenge,
  newChallenge,
  plan,
  transaction,
}) {
  if (!plan.has_floating_risk) return null;

  const baseBalance = Number(plan.balance);
  const type = plan.floating_risk_type || "percent";
  const value = Number(plan.floating_risk_value || 0);

  const maxRiskAmount =
    type === "percent" ? baseBalance * (value / 100) : value;

  return UserChallengeRisk.create(
    {
      user_challenge_id: newChallenge.id,
      is_enabled: Boolean(sourceChallenge.floating_risk_enabled),
      type,
      value,
      base_on: plan.floating_risk_base_on || "starting_balance",
      last_base_balance_usd: baseBalance,
      max_risk_amount_usd: maxRiskAmount,
    },
    { transaction },
  );
}

async function createFirstOrder({
  newChallenge,
  origin,
  pricing,
  paymentPlan,
  gateway,
  dollarPrice,
  adminId,
  transaction,
}) {
  const installment = pricing.first;

  return Order.create(
    {
      user_id: newChallenge.user_id,
      user_challenge_id: newChallenge.id,
      admin_id: adminId ?? null,

      type: "challenge_purchase",
      gateway,
      status: "pending",
      currency: "USD",
      gateway_order_id: `insurance-buyCh-${newChallenge.user_id}-${Date.now()}`,

      payment_plan: paymentPlan,
      installment_number: paymentPlan === "installment" ? 1 : 0,
      order_group_id: randomUUID(),
      payment_attempt_number: 1,

      base_amount_usd: installment.baseUsd,
      base_amount_irr: Math.round(installment.baseUsd * dollarPrice * 10),

      insurance_amount_usd: 0,
      insurance_amount_irr: 0,

      discount_usd: 0,
      discount_irr: 0,

      amount_usd: installment.totalUsd,
      amount_irr: Math.round(installment.totalUsd * dollarPrice * 10),

      final_amount_usd: installment.totalUsd,
      final_amount_irr: Math.round(installment.totalUsd * dollarPrice * 10),

      meta: {
        ...origin,
        base_price_usd: pricing.baseUsd,
      },
    },
    { transaction },
  );
}

/**
 * بیمه‌ی چالش (مدل جدید)
 *
 * وقتی کاربرِ بیمه‌دار در هر مرحله‌ای رد می‌شود، یک چالشِ جایگزینِ کاملاً جدید
 * از فاز ۱ ساخته می‌شود: بدون بیمه و با تخفیف پلکانی بر اساس فازی که در آن رد شده
 * (فاز۱ ۴۰٪، فاز۲ ۳۰٪، ریل ۲۰٪).
 *
 * سفارش قسط اولِ چالش جدید در وضعیت pending ساخته می‌شود تا کاربر
 * از همان مسیر پرداخت همیشگی (payPendingChallenge) پرداخت کند.
 *
 * @param {object}  params
 * @param {object}  [params.userChallenge]    چالشِ رد‌شده (ترجیحاً قفل‌شده)
 * @param {number}  [params.userChallengeId]  اگر خود شیء را پاس نداده باشی
 * @param {number}  [params.adminId]
 * @param {string}  [params.platform]         mt5 | ctrader
 * @param {object}  [params.transaction]      تراکنش بیرونی
 */
const InsuranceReload = async ({
  userChallenge,
  userChallengeId,
  adminId = null,
  platform = null,
  transaction,
}) => {
  const ownTransaction = !transaction;
  const t = transaction || (await sequelize.transaction());

  try {
    if (!userChallenge && userChallengeId) {
      userChallenge = await UserChallenge.findByPk(userChallengeId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
    }

    if (!userChallenge) {
      throw Object.assign(new Error("چالش برای اعمال بیمه پیدا نشد"), {
        status: 400,
      });
    }

    if (!userChallenge.has_insurance) {
      return { applied: false, reason: "no_insurance" };
    }

    // بیمه فقط یک بار مصرف می‌شود؛ همین گارد جلوی اجرای دوباره را می‌گیرد
    if (userChallenge.insurance_status !== INSURANCE_STATUS.ACTIVE) {
      return { applied: false, reason: "insurance_already_consumed" };
    }

    if (userChallenge.status !== "closed") {
      return { applied: false, reason: "challenge_not_closed" };
    }

    const phaseIndex = Number(userChallenge.current_phase_index);

    if (!INSURANCE_EVENT_TYPE[phaseIndex]) {
      return { applied: false, reason: "unknown_phase" };
    }

    const plan = await ChallengePlan.findByPk(userChallenge.challenge_plan_id, {
      transaction: t,
    });

    if (!plan) {
      throw Object.assign(new Error("پلن این چالش پیدا نشد"), { status: 400 });
    }

    const phase1 = await ChallengePhase.findOne({
      where: { challenge_plan_id: plan.id, phase_index: 1 },
      attributes: ["id", "phase_index", "group"],
      transaction: t,
    });

    if (!phase1) {
      throw Object.assign(new Error("مرحله اول این پلن پیدا نشد"), {
        status: 400,
      });
    }

    const dollarPrice = await getDollarPrice(t);
    const basePriceUsd = getBasePriceUsd(userChallenge, plan);

    if (!Number.isFinite(basePriceUsd) || basePriceUsd <= 0) {
      return { applied: false, reason: "no_base_price" };
    }

    // تخفیف روی همین مبلغ حساب می‌شود، نه روی کل قیمت پلن
    const paidBaseUsd = getPaidBaseUsd(userChallenge);

    if (paidBaseUsd <= 0) {
      return { applied: false, reason: "no_paid_base_amount" };
    }

    const paymentPlan =
      userChallenge.payment_plan === "installment" ? "installment" : "full";

    const pricing = buildReloadPricing({
      basePriceUsd,
      paidBaseUsd,
      phaseIndex,
      paymentPlan,
      dollarPrice,
    });

    // حسابی که کاربر باهاش رد شده — برای وصل کردن دو چالش در لاگ‌ها
    const failedAccount = await getFailedAccount(
      userChallenge.id,
      phaseIndex,
      t,
    );

    const origin = buildInsuranceOrigin({
      userChallenge,
      phaseIndex,
      pricing,
      failedAccount,
    });

    const snapshot = buildReloadSnapshot({ userChallenge, origin });

    const newChallenge = await createReplacementChallenge({
      sourceChallenge: userChallenge,
      plan,
      phase1,
      pricing,
      snapshot,
      paymentPlan,
      dollarPrice,
      adminId,
      platform,
      transaction: t,
    });

    await copyFloatingRisk({
      sourceChallenge: userChallenge,
      newChallenge,
      plan,
      transaction: t,
    });

    const gateway = await getLastGateway(userChallenge.id, t);

    const order = await createFirstOrder({
      newChallenge,
      origin,
      pricing,
      paymentPlan,
      gateway,
      dollarPrice,
      adminId,
      transaction: t,
    });

    await userChallenge.update(
      { insurance_status: INSURANCE_STATUS.USED },
      { transaction: t },
    );

    // ── لاگِ دوطرفه ──
    // از هر کدام از دو چالش که نگاه کنی، شناسه‌ی طرف مقابل در تاریخچه هست.
    const accountLabel = describeAccount(failedAccount);

    // سمت چالشِ رد‌شده: بیمه اینجا مصرف شد
    await logInsuranceEvent({
      userChallengeId: userChallenge.id,
      phaseIndex,
      adminId,
      title:
        `استفاده از بیمه در ${PHASE_TITLE[phaseIndex]} — حساب ${accountLabel} رد شد. ` +
        `چالش جایگزین #${newChallenge.id} (سفارش #${order.id}) با ${pricing.percent}٪ تخفیف ` +
        `معادل ${pricing.discountUsd} دلار روی ${pricing.paidBaseUsd} دلارِ پرداختی، به مبلغ ${pricing.payableUsd} دلار ساخته شد`,
      transaction: t,
    });

    // سمت چالشِ جدید: این چالش از کجا آمده
    await logInsuranceEvent({
      userChallengeId: newChallenge.id,
      phaseIndex,
      adminId,
      title:
        `این چالش با بیمه‌ی چالش #${userChallenge.id} (حساب ${accountLabel}) ساخته شد — ` +
        `رد‌شده در ${PHASE_TITLE[phaseIndex]}، ${pricing.percent}٪ تخفیف معادل ${pricing.discountUsd} دلار. ` +
        `مبلغ قابل پرداخت ${pricing.payableUsd} دلار` +
        (paymentPlan === "installment"
          ? ` در دو قسط ${pricing.first.totalUsd} و ${pricing.second.totalUsd} دلاری`
          : " (یکجا)"),
      transaction: t,
    });

    if (ownTransaction) await t.commit();

    return {
      applied: true,
      source_user_challenge_id: userChallenge.id,
      failed_phase_index: phaseIndex,
      failed_account_id: failedAccount?.id ?? null,
      failed_account_login:
        failedAccount?.mt_login || failedAccount?.platform_login || null,
      failed_account_platform: failedAccount?.platform ?? null,
      discount_percent: pricing.percent,
      base_price_usd: pricing.baseUsd,
      paid_base_usd: pricing.paidBaseUsd,
      discount_usd: pricing.discountUsd,
      total_price_usd: pricing.payableUsd,
      payment_plan: paymentPlan,
      first_installment_usd: pricing.first.totalUsd,
      second_installment_usd: pricing.second?.totalUsd ?? null,
      new_user_challenge_id: newChallenge.id,
      order_id: order.id,
      gateway_order_id: order.gateway_order_id,
    };
  } catch (err) {
    if (ownTransaction && !t.finished) await t.rollback();
    throw err;
  }
};

module.exports = InsuranceReload;
