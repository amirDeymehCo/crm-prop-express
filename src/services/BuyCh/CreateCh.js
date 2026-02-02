/**
 * purchaseChallenge (FULL, FIXED)
 * ✅ insurance fee
 * ✅ coupon discount
 * ✅ free challenge (final_price_usd === 0) => swap profit targets (phase1 <-> phase2)
 * ✅ floating risk from plan + NEW: floating_risk_fee
 *    Policy: اگر کاربر ریسک شناور را OFF کند => floating_risk_fee به قیمت اضافه می‌شود
 *
 * BODY (recommended):
 * {
 *   challenge_plan_id: number,
 *   gateway: "wallet" | "peykan" | "nowpayments" | ...,
 *   with_insurance?: boolean,
 *   coupon_code?: string,
 *   floating_risk_enabled?: boolean,     // NEW (preferred)
 *   floating_risk?: { is_enabled?: boolean } // backward compatible
 * }
 *
 * IMPORTANT:
 * - باید در مدل UserChallenge این فیلدها وجود داشته باشد:
 *   - starting_balance_usd
 *   - display_balance_usd
 *   - floating_risk_fee_usd  (NEW)
 *   - challenge_phase
 */

const sequelize = require("../../../db");

const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../models/Challenge/ChallengePhase");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const UserChallengeRisk = require("../../models/UserChallengeRisk");
const Coupon = require("../../models/Coupon");
const CouponUsage = require("../../models/CouponUsage");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");

// ===================== helpers اصلی ===================== //

async function getActivePlan(planId, transaction) {
  const plan = await ChallengePlan.findOne({
    where: { id: planId, is_active: true },
    include: [ChallengePhase],
    transaction,
  });

  if (!plan) {
    const err = new Error("پلن چالش یافت نشد یا غیر فعال است");
    err.status = 404;
    throw err;
  }

  return plan;
}

function buildRulesSnapshotWithFreeLogic({ plan, isFree }) {
  const phases = [...(plan.ChallengePhases || [])]
    .sort((a, b) => a.phase_index - b.phase_index)
    .map((p) => ({
      phase_index: p.phase_index,
      name: p.name,
      duration_days: p.duration_days,
      min_trading_days: p.min_trading_days,
      max_daily_drawdown_percent: p.max_daily_drawdown_percent,
      max_overall_drawdown_percent: p.max_overall_drawdown_percent,
      profit_target_percent: Number(p.profit_target_percent),
      group: p.group || null,
    }));

  // فقط اگر چالش با کوپن رایگان شده
  if (isFree) {
    const p1 = phases.find((p) => Number(p.phase_index) === 1);
    const p2 = phases.find((p) => Number(p.phase_index) === 2);

    if (p1 && p2) {
      [p1.profit_target_percent, p2.profit_target_percent] = [
        p2.profit_target_percent,
        p1.profit_target_percent,
      ];
    }
  }

  return {
    plan: {
      id: plan.id,
      title: plan.title,
      balance: plan.balance,
      leverage: plan.leverage,
      profit_share_percent: plan.profit_share_percent,
      profit_target_percent: plan.profit_target_percent,
      price_usd: plan.price_usd,
    },
    phases,
    meta: {
      is_free_challenge: isFree,
      profit_target_swapped: isFree,
    },
  };
}

// -------- بیمه ---------- //

function calculateInsurance(plan, withInsurance) {
  if (!withInsurance || !plan.allow_insurance) {
    return {
      enabled: false,
      fee_usd: 0,
      status: "none",
    };
  }

  let fee = 0;

  switch (plan.insurance_fee_type) {
    case "percent_of_price":
      fee = Number(plan.price_usd) * (Number(plan.insurance_value) / 100);
      break;
    case "percent_of_balance":
      fee = Number(plan.balance) * (Number(plan.insurance_value) / 100);
      break;
    case "fixed":
      fee = Number(plan.insurance_value);
      break;
    default:
      fee = 0;
  }

  return {
    enabled: true,
    fee_usd: fee,
    status: "active",
  };
}

// -------- هزینه ریسک شناور ---------- //
// Policy: اگر پلن floating risk دارد و کاربر خاموش کند => fee اضافه می‌شود
function calculateFloatingRiskFee(plan, floatingRiskEnabled) {
  if (!plan?.has_floating_risk) {
    return { enabled: false, fee_usd: 0 };
  }

  const fee = Number(plan.floating_risk_fee || 0);

  if (floatingRiskEnabled === false) {
    return { enabled: false, fee_usd: fee };
  }

  return { enabled: true, fee_usd: 0 };
}

// -------- کوپن تخفیف ---------- //
// تغییر: به جای insuranceFee، basePrice را پاس می‌دهیم چون fee ریسک شناور هم داخل basePrice است
async function validateAndApplyCoupon({
  couponCode,
  plan,
  user,
  basePrice,
  transaction,
}) {
  if (!couponCode) {
    return { coupon: null, discount: 0 };
  }

  const coupon = await Coupon.findOne({
    where: { code: couponCode, is_active: true },
    transaction,
  });

  if (!coupon) {
    const err = new Error("کد تخفیف نامعتبر است");
    err.status = 400;
    throw err;
  }

  const now = new Date();
  if (coupon.valid_from && coupon.valid_from > now) {
    const err = new Error("این کد هنوز فعال نشده است");
    err.status = 400;
    throw err;
  }
  if (coupon.valid_to && coupon.valid_to < now) {
    const err = new Error("این کد منقضی شده است");
    err.status = 400;
    throw err;
  }

  // محدود به پلن خاص
  if (coupon.challenge_plan_id && coupon.challenge_plan_id !== plan.id) {
    const err = new Error("این کد برای این چالش قابل استفاده نیست");
    err.status = 400;
    throw err;
  }

  // سقف استفاده کلی
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
    const err = new Error("سقف استفاده از این کد پر شده است");
    err.status = 400;
    throw err;
  }

  // سقف برای هر کاربر
  const userUsageCount = await CouponUsage.count({
    where: { coupon_id: coupon.id, user_id: user.id },
    transaction,
  });

  if (coupon.max_uses_per_user && userUsageCount >= coupon.max_uses_per_user) {
    const err = new Error("شما قبلا از این کد استفاده کرده‌اید");
    err.status = 400;
    throw err;
  }

  let discount = 0;
  if (coupon.type === "percent") {
    discount = Number(basePrice) * (Number(coupon.value) / 100);
  } else if (coupon.type === "fixed") {
    discount = Number(coupon.value);
  }

  discount = Math.min(Number(discount), Number(basePrice));

  // حداقل مبلغ سفارش
  if (
    coupon.min_order_amount_usd &&
    Number(basePrice) < coupon.min_order_amount_usd
  ) {
    const err = new Error("مبلغ سفارش برای استفاده از این کد کافی نیست");
    err.status = 400;
    throw err;
  }

  return { coupon, discount };
}

// -------- قیمت نهایی ---------- //

function buildPriceSummary({ plan, insuranceFee, floatingRiskFee, discount }) {
  const basePrice =
    Number(plan.price_usd) +
    Number(insuranceFee || 0) +
    Number(floatingRiskFee || 0);

  const finalPrice = Math.max(basePrice - Number(discount || 0), 0);

  return {
    base_price_usd: basePrice,
    discount_usd: Number(discount || 0),
    final_price_usd: finalPrice,
    floating_risk_fee_usd: Number(floatingRiskFee || 0),
  };
}

// -------- snapshot ریسک شناور (مقدار ریسک از plan) ---------- //

function buildFloatingRiskSnapshot(plan, startingBalance) {
  if (!plan.has_floating_risk) {
    return {
      floating_risk_type: null,
      floating_risk_value: null,
      floating_risk_base_on: null,
      floating_risk_max_risk_usd: null,
    };
  }

  const type = plan.floating_risk_type; // نوع مقدار ریسک
  const value = Number(plan.floating_risk_value || 0);
  const baseOn = plan.floating_risk_base_on || "starting_balance";

  const baseBalance =
    baseOn === "starting_balance"
      ? Number(startingBalance)
      : Number(startingBalance);

  let maxRisk = 0;
  if (type === "percent") maxRisk = baseBalance * (value / 100);
  else if (type === "fixed") maxRisk = value;

  return {
    floating_risk_type: type,
    floating_risk_value: value,
    floating_risk_base_on: baseOn,
    floating_risk_max_risk_usd: maxRisk,
  };
}

// -------- ریسک شناور (جدول جداگانه) ---------- //
// ما از front مقدار/type/value را نمی‌گیریم؛ از plan snapshot می‌گیریم.
// فقط enabled/disabled انتخاب کاربر را ذخیره می‌کنیم.
function calculateMaxRisk({ type, value, baseBalance }) {
  if (type === "percent") return Number(baseBalance) * (Number(value) / 100);
  return Number(value);
}

async function createFloatingRiskIfProvided({
  userChallenge,
  floatingRiskPayload,
  transaction,
}) {
  if (!floatingRiskPayload) return null;

  const {
    is_enabled = true,
    type = "percent",
    value = 0,
    base_on = "starting_balance",
  } = floatingRiskPayload;

  const baseBalance =
    base_on === "starting_balance"
      ? Number(userChallenge.starting_balance_usd)
      : Number(
          userChallenge.display_balance_usd ||
            userChallenge.starting_balance_usd,
        );

  const maxRiskAmount = calculateMaxRisk({ type, value, baseBalance });

  const risk = await UserChallengeRisk.create(
    {
      user_challenge_id: userChallenge.id,
      is_enabled,
      type,
      value,
      base_on,
      last_base_balance_usd: baseBalance,
      max_risk_amount_usd: maxRiskAmount,
    },
    { transaction },
  );

  return risk;
}

// -------- ساخت رکورد چالش کاربر ---------- //

async function createUserChallengeRecord({
  user,
  plan,
  rulesSnapshot,
  insuranceInfo,
  prices,
  floatingRiskEnabled,
  transaction,
}) {
  const startingBalance = Number(plan.balance);

  const floatingRiskSnapshot = buildFloatingRiskSnapshot(plan, startingBalance);

  const phaseFind = await ChallengePhase.findOne({
    where: { challenge_plan_id: plan.id, phase_index: 1 },
    attributes: ["id", "phase_index", "group"],
    transaction,
  });

  if (!phaseFind) {
    const err = new Error("با این پلن مرحله ای پیدا نشد");
    err.status = 400;
    throw err;
  }

  const userChallenge = await UserChallenge.create(
    {
      user_id: user.id,
      challenge_plan_id: plan.id,
      challenge_type_id: plan?.challenge_type_id,
      status: "pending_payment",
      current_phase_index: 1,

      starting_balance_usd: startingBalance,
      display_balance_usd: startingBalance,

      has_insurance: insuranceInfo.enabled,
      insurance_fee_usd: insuranceInfo.fee_usd || null,
      insurance_status: insuranceInfo.status,

      price_usd: prices.base_price_usd,
      discount_usd: prices.discount_usd,
      final_price_usd: prices.final_price_usd,

      // ✅ NEW: fee بابت خاموش کردن floating risk
      floating_risk_fee_usd: Number(prices.floating_risk_fee_usd || 0),

      // ✅ انتخاب کاربر: روشن/خاموش
      floating_risk_enabled: plan.has_floating_risk
        ? Boolean(floatingRiskEnabled)
        : false,

      rules_snapshot: rulesSnapshot,

      // فاز جاری
      challenge_phase: phaseFind.id,

      // snapshot مقدار ریسک از plan
      ...floatingRiskSnapshot,
    },
    { transaction },
  );

  return userChallenge;
}

// -------- ثبت استفاده از کوپن ---------- //

async function registerCouponUsage({
  coupon,
  user,
  userChallenge,
  discount,
  transaction,
}) {
  if (!coupon) return;

  await CouponUsage.create(
    {
      coupon_id: coupon.id,
      user_id: user.id,
      user_challenge_id: userChallenge.id,
      discount_amount_usd: Number(discount || 0),
    },
    { transaction },
  );

  await coupon.increment("used_count", { by: 1, transaction });
}

// -------- ساخت سفارش / پرداخت ---------- //

async function createOrderRecord({
  user,
  provider,
  userChallenge,
  gateway,
  prices,
  transaction,
}) {
  const orderId = `buyCh-${user?.id}-${Date.now()}`;

  const order = await Order.create(
    {
      user_id: user.id,
      user_challenge_id: userChallenge.id,
      amount_usd: prices.final_price_usd,
      gateway: prices.final_price_usd === 0 ? "coupon_free" : gateway,
      status: prices.final_price_usd === 0 ? "paid" : "pending",
      gateway_order_id: orderId,
      type:
        gateway === "wallet"
          ? "challenge_purchase_wallet"
          : "challenge_purchase",
    },
    { transaction },
  );

  await Payment.create(
    {
      provider: prices.final_price_usd === 0 ? "coupon_free" : provider,
      order_id: orderId,
      user_id: user.id,
      amount_usd: prices.final_price_usd,
      status: prices.final_price_usd === 0 ? "confirmed_free" : "pending",
      pay_currency: "usd",
      UserChallenge: userChallenge.id,
    },
    { transaction },
  );

  return order;
}

// ===================== کنترلر اصلی خرید ===================== //

async function purchaseChallenge(req, res, next) {
  const t = await sequelize.transaction();

  try {
    const user = req.user;

    const {
      challenge_plan_id,
      gateway,
      with_insurance = false,
      coupon_code,

      // ✅ NEW preferred
      floating_risk_enabled,

      // ✅ backward compatible
      floating_risk, // { is_enabled?: boolean }
    } = req.body;

    // 1) plan
    const plan = await getActivePlan(challenge_plan_id, t);

    // 2) insurance
    const insuranceInfo = calculateInsurance(plan, with_insurance);

    // 3) resolve floating risk enabled
    // preference: floating_risk_enabled -> floating_risk.is_enabled -> default true
    const floatingEnabled =
      typeof floating_risk_enabled === "boolean"
        ? floating_risk_enabled
        : floating_risk && typeof floating_risk.is_enabled === "boolean"
          ? floating_risk.is_enabled
          : true;

    // 4) floating risk fee (OFF => fee)
    const floatingRiskFeeInfo = calculateFloatingRiskFee(plan, floatingEnabled);

    // 5) basePrice for coupon
    const basePrice =
      Number(plan.price_usd) +
      Number(insuranceInfo.fee_usd || 0) +
      Number(floatingRiskFeeInfo.fee_usd || 0);

    // 6) coupon
    const { coupon, discount } = await validateAndApplyCoupon({
      couponCode: coupon_code,
      plan,
      user,
      basePrice,
      transaction: t,
    });

    // 7) prices
    const prices = buildPriceSummary({
      plan,
      insuranceFee: insuranceInfo.fee_usd,
      floatingRiskFee: floatingRiskFeeInfo.fee_usd,
      discount,
    });

    // 8) rules snapshot (swap if free)
    const rulesSnapshot = buildRulesSnapshotWithFreeLogic({
      plan,
      isFree: prices.final_price_usd === 0,
    });

    // 9) create user challenge
    const userChallenge = await createUserChallengeRecord({
      user,
      plan,
      rulesSnapshot,
      insuranceInfo,
      prices,
      floatingRiskEnabled: floatingEnabled,
      transaction: t,
    });

    // 10) optional: create UserChallengeRisk row (history) from plan snapshot
    const floatingRiskRow = await createFloatingRiskIfProvided({
      userChallenge,
      floatingRiskPayload: plan.has_floating_risk
        ? {
            is_enabled: Boolean(floatingEnabled),
            type: plan.floating_risk_type,
            value: plan.floating_risk_value,
            base_on: plan.floating_risk_base_on || "starting_balance",
          }
        : null,
      transaction: t,
    });

    // 11) coupon usage
    await registerCouponUsage({
      coupon,
      user,
      userChallenge,
      discount,
      transaction: t,
    });

    // 12) order/payment
    const order = await createOrderRecord({
      user,
      provider: gateway,
      userChallenge,
      gateway,
      prices,
      transaction: t,
    });

    await t.commit();

    return {
      userChallenge,
      floatingRisk: floatingRiskRow,
      order,
    };
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

module.exports = purchaseChallenge;
