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
const Setting = require("../../models/Setting");
const splitInstallmentAmount = require("../PaymentPlan/SplitInstallmentAmount");
const { randomUUID } = require("crypto");

// ===================== helpers اصلی ===================== //

async function getActivePlan(planId, transaction) {
  const plan = await ChallengePlan.findOne({
    where: { id: planId, is_active: true },
    include: [ChallengePhase],
    // transaction,
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
  orderTotalUsd,
}) {
  if (!couponCode) {
    return { coupon: null, discount: 0 };
  }

  const coupon = await Coupon.findOne({
    where: { code: String(couponCode).trim(), is_active: true },
    // transaction,
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

  // ⚠️ کوپن اختصاصی یک کاربر
  if (coupon.user_id && Number(coupon.user_id) !== Number(user.id)) {
    const err = new Error("این کد برای حساب شما صادر نشده است");
    err.status = 400;
    throw err;
  }

  // ⚠️ محدود به نوع چالش خاص (این چک اصلاً وجود نداشت و کوپنِ مخصوص
  // یک نوع چالش روی همه‌ی انواع دیگر هم اعمال می‌شد)
  if (
    coupon.challenge_type_id &&
    Number(coupon.challenge_type_id) !== Number(plan.challenge_type_id)
  ) {
    const err = new Error("این کد برای این نوع چالش قابل استفاده نیست");
    err.status = 400;
    throw err;
  }

  // محدود به پلن خاص
  if (
    coupon.challenge_plan_id &&
    Number(coupon.challenge_plan_id) !== Number(plan.id)
  ) {
    const err = new Error("این کد برای این چالش قابل استفاده نیست");
    err.status = 400;
    throw err;
  }

  // حداقل مبلغ سفارش — قبل از محاسبه‌ی تخفیف و روی کل مبلغ سفارش
  const orderTotal = Number(orderTotalUsd ?? basePrice);
  if (
    coupon.min_order_amount_usd &&
    orderTotal < Number(coupon.min_order_amount_usd)
  ) {
    const err = new Error("مبلغ سفارش برای استفاده از این کد کافی نیست");
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
    // transaction,
  });

  if (coupon.max_uses_per_user && userUsageCount >= coupon.max_uses_per_user) {
    const err = new Error("شما قبلا از این کد استفاده کرده‌اید");
    err.status = 400;
    throw err;
  }

  const couponValue = Number(coupon.value);

  if (!Number.isFinite(couponValue) || couponValue <= 0) {
    const err = new Error("مقدار کد تخفیف معتبر نیست");
    err.status = 400;
    throw err;
  }

  let discount = 0;
  if (coupon.type === "percent") {
    // درصد نباید از ۱۰۰ بیشتر باشد
    const percent = Math.min(couponValue, 100);
    discount = Number(basePrice) * (percent / 100);
  } else if (coupon.type === "fixed") {
    discount = couponValue;
  }

  discount = Math.max(Math.min(Number(discount), Number(basePrice)), 0);

  return { coupon, discount };
}

// -------- قیمت نهایی ---------- //

function buildPriceSummary({
  floatingRiskFee,
  discount,
  final_base_amount,
  final_insurance_amount,
  second_installment_amount = 0,
  // all price
  challengeBasePriceUsd,
  insuranceFeeUsd,
}) {
  const basePrice =
    Number(final_base_amount) +
    Number(final_insurance_amount || 0) +
    Number(floatingRiskFee || 0);

  // مبلغ سفارشِ همین لحظه (قسط اول یا کل مبلغ)
  const finalPrice = Math.max(basePrice - Number(discount || 0), 0);

  const secondInstallment = Number(second_installment_amount || 0);

  return {
    price_based: Number(final_base_amount),
    base_price_usd: Number(final_base_amount),
    insurance_amount: Number(final_insurance_amount),
    discount_usd: Number(discount || 0),
    final_price_usd: finalPrice,
    floating_risk_fee_usd: Number(floatingRiskFee || 0),

    // مجموع چیزی که کاربر در کل این چالش می‌پردازد (هر دو قسط، بعد از تخفیف)
    total_payable_usd: Number((finalPrice + secondInstallment).toFixed(2)),

    // مبلغی که بعد از سفارش اول باقی می‌ماند
    remaining_after_first_usd: secondInstallment,

    // all price
    challengeBasePriceUsd,
    insuranceFeeUsd,
    total_all_price: challengeBasePriceUsd + insuranceFeeUsd,
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
  admin_id = null,
  platform,
  payment_type = "full",
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

  console.log("prices=>", prices);
  const setting = await Setting.findByPk(1, { transaction });

  // مانده = فقط قسط دوم. قبلاً اشتباهاً مبلغ قسط اول (بعد از تخفیف) اینجا
  // می‌نشست؛ اگر کوپن روی قسط اول اعمال شده بود، قسط دوم کمتر از مقدار
  // واقعی از کاربر گرفته می‌شد.
  const remaining_amount_usd = Number(prices?.remaining_after_first_usd || 0);

  console.log("total_payable_usd>", prices?.total_payable_usd);
  console.log("remaining_amount_usd>", remaining_amount_usd);

  const userChallenge = await UserChallenge.create(
    {
      user_id: user.id,
      admin_id: admin_id ?? null,
      challenge_plan_id: plan.id,
      challenge_type_id: plan?.challenge_type_id,
      status: "pending_payment",
      current_phase_index: 1,
      current_phase_id: phaseFind?.id,

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

      platform: platform || "ctrader",

      // snapshot مقدار ریسک از plan
      ...floatingRiskSnapshot,

      // payment type files
      payment_plan: payment_type,
      total_price_usd: prices?.total_payable_usd,
      total_price_irr: prices?.total_payable_usd * setting.dollar_price * 10,
      remaining_amount_usd,
      remaining_amount_irr:
        remaining_amount_usd *
        (setting?.dollar_price + setting?.bonus_dollar) *
        10,
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

  // ⚠️ سقف‌ها اینجا دوباره چک می‌شوند، نه فقط در validateAndApplyCoupon.
  // آن‌جا خارج از تراکنش و بدون قفل خوانده می‌شود، پس دو درخواست همزمان
  // می‌توانستند هر دو از سقف رد شوند و کوپن بیش از حد مجاز مصرف شود.
  // با قفل کردن ردیف کوپن، درخواست دوم پشت اولی صف می‌کشد و مقدار
  // به‌روزِ used_count را می‌بیند.
  const lockedCoupon = await Coupon.findByPk(coupon.id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!lockedCoupon || !lockedCoupon.is_active) {
    const err = new Error("کد تخفیف نامعتبر است");
    err.status = 400;
    throw err;
  }

  if (
    lockedCoupon.max_uses &&
    Number(lockedCoupon.used_count) >= Number(lockedCoupon.max_uses)
  ) {
    const err = new Error("سقف استفاده از این کد پر شده است");
    err.status = 400;
    throw err;
  }

  if (lockedCoupon.max_uses_per_user) {
    const userUsageCount = await CouponUsage.count({
      where: { coupon_id: lockedCoupon.id, user_id: user.id },
      transaction,
    });

    if (userUsageCount >= Number(lockedCoupon.max_uses_per_user)) {
      const err = new Error("شما قبلا از این کد استفاده کرده‌اید");
      err.status = 400;
      throw err;
    }
  }

  await CouponUsage.create(
    {
      coupon_id: lockedCoupon.id,
      user_id: user.id,
      user_challenge_id: userChallenge.id,
      discount_amount_usd: Number(discount || 0),
    },
    { transaction },
  );

  await lockedCoupon.increment("used_count", { by: 1, transaction });
}

// -------- ساخت سفارش / پرداخت ---------- //

async function createOrderRecord({
  user,
  provider,
  userChallenge,
  gateway,
  transaction,
  admin_id = null,
  coupon,

  paymentPlan = "full",
  installmentNumber = 0,
  orderGroupId,
  paymentAttemptNumber = 1,
  parentOrderId = null,

  // payment type
  baseAmountUsd,
  baseAmountIrr,
  insuranceAmountUsd = 0,
  insuranceAmountIrr = 0,
  discountUsd = 0,
  discountIrr = 0,
  amountUsd,
  amountIrr,
}) {
  const orderId = `buyCh-${user?.id}-${Date.now()}`;

  const setting = await Setting.findOne({
    where: { id: 1 },
    transaction,
  });

  const dollarPrice =
    Number(setting?.dollar_price || 1800000) +
    Number(setting?.bonus_dollar || 0);

  const finalAmountUsd = Number(amountUsd || 0);
  const finalAmountIrr = Number(amountIrr ?? finalAmountUsd * dollarPrice * 10);

  const order = await Order.create(
    {
      user_id: user.id,
      user_challenge_id: userChallenge.id,

      type:
        gateway === "wallet"
          ? "challenge_purchase_wallet"
          : "challenge_purchase",

      payment_plan: paymentPlan,
      installment_number: installmentNumber,
      order_group_id: orderGroupId,
      payment_attempt_number: paymentAttemptNumber,
      parent_order_id: parentOrderId,

      // Components
      base_amount_usd: baseAmountUsd,
      base_amount_irr: baseAmountIrr,

      insurance_amount_usd: insuranceAmountUsd,
      insurance_amount_irr: insuranceAmountIrr,

      // Final payable amount
      amount_usd: finalAmountUsd,
      amount_irr: finalAmountIrr,

      discount_usd: discountUsd,
      discount_irr: discountIrr,

      final_amount_usd: finalAmountUsd,
      final_amount_irr: finalAmountIrr,

      currency: "USD",
      gateway: finalAmountUsd === 0 ? "coupon_free" : gateway,
      status: finalAmountUsd === 0 ? "paid" : "pending",
      gateway_order_id: orderId,

      admin_id: admin_id ?? null,

      coupon_id: coupon?.id ?? null,
      coupon_code_snapshot: coupon?.code ?? null,
    },
    { transaction },
  );

  await Payment.create(
    {
      provider: finalAmountUsd === 0 ? "coupon_free" : provider,
      order_id: orderId,
      user_id: user.id,

      amount_irr: finalAmountIrr,
      amount_usd: finalAmountUsd,

      status: finalAmountUsd === 0 ? "confirmed_free" : "pending",
      pay_currency: "usd",
      UserChallenge: userChallenge.id,
    },
    { transaction },
  );

  return order;
}

// ===================== کنترلر اصلی خرید ===================== //

async function purchaseChallenge(req, res, next) {
  try {
    const user = req.user;
    const orderGroupId = randomUUID();

    // =========================
    // READ / CALCULATE
    // خارج transaction
    // =========================

    const plan = await getActivePlan(req.body.challenge_plan_id);

    const insuranceInfo = calculateInsurance(plan, req.body.with_insurance);

    const floatingEnabled =
      typeof req.body.floating_risk_enabled === "boolean"
        ? req.body.floating_risk_enabled
        : req.body.floating_risk &&
            typeof req.body.floating_risk.is_enabled === "boolean"
          ? req.body.floating_risk.is_enabled
          : true;

    const floatingRiskFeeInfo = calculateFloatingRiskFee(plan, floatingEnabled);

    const challengeBasePriceUsd = Number(plan.price_usd);

    const insuranceFeeUsd = Number(insuranceInfo.fee_usd || 0);

    const floatingRiskFeeUsd = Number(floatingRiskFeeInfo.fee_usd || 0);

    const grossPriceUsd =
      challengeBasePriceUsd + insuranceFeeUsd + floatingRiskFeeUsd;
    const basePrice =
      challengeBasePriceUsd + insuranceFeeUsd + floatingRiskFeeUsd;

    const setting = await Setting.findByPk(1);

    console.log(challengeBasePriceUsd);
    console.log(insuranceFeeUsd);
    console.log(grossPriceUsd);

    // 1) set final prices
    let final_base_amount = 0;
    let final_insurance_amount = 0;

    // مبلغی که بعد از سفارش اول هنوز بدهکار می‌ماند (قسط دوم).
    // برای پرداخت یکجا صفر است.
    let second_installment_amount = 0;

    if (req?.body?.payment_type === "full") {
      final_base_amount = challengeBasePriceUsd;
      final_insurance_amount = insuranceFeeUsd;
    } else if (req?.body?.payment_type === "installment") {
      const amounts = splitInstallmentAmount({
        totalBaseUsd: challengeBasePriceUsd,
        totalBaseIrr:
          Number(challengeBasePriceUsd) *
          Number(setting?.dollar_price + setting?.bonus_dollar),
        totalInsuranceUsd: insuranceFeeUsd,
        totalInsuranceIrr:
          Number(insuranceFeeUsd) *
          Number(setting?.dollar_price + setting?.bonus_dollar),
      });

      final_base_amount = amounts?.first?.baseUsd;
      final_insurance_amount = amounts?.first?.insuranceUsd;
      second_installment_amount = Number(amounts?.second?.totalUsd || 0);
    }

    // coupon validation
    const { coupon, discount } = await validateAndApplyCoupon({
      couponCode: req.body.coupon_code,
      plan,
      user,
      basePrice: final_base_amount,
      // مبلغ کل همین سفارش (پایه + بیمه + fee ریسک شناور) برای چک حداقل مبلغ
      orderTotalUsd:
        Number(final_base_amount) +
        Number(final_insurance_amount || 0) +
        Number(floatingRiskFeeUsd || 0),
    });

    if (req?.body?.payment_type === "installment" && coupon) {
      const err = new Error(
        "کاربر گرامی خرید اقساطی با کد تخفیف امکان پذیر نمیباشد",
      );
      err.status = 400;
      throw err;
    }

    const prices = buildPriceSummary({
      insuranceFee: insuranceFeeUsd,
      floatingRiskFee: floatingRiskFeeInfo.fee_usd,
      discount,
      final_base_amount,
      final_insurance_amount,
      second_installment_amount,

      // all price
      challengeBasePriceUsd,
      insuranceFeeUsd,
    });

    console.log("prices=>", prices);

    // =========================
    // TRANSACTION
    // =========================

    const result = await sequelize.transaction(async (t) => {
      const rulesSnapshot = buildRulesSnapshotWithFreeLogic({
        plan,
        isFree: prices.final_price_usd === 0,
      });

      const userChallenge = await createUserChallengeRecord({
        user,
        plan,
        rulesSnapshot,
        insuranceInfo,
        prices,
        floatingRiskEnabled: floatingEnabled,
        transaction: t,
        admin_id: req?.admin?.id,
        platform: req?.body?.platform,
        payment_type: req?.body?.payment_type,
      });

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

      await registerCouponUsage({
        coupon,
        user,
        userChallenge,
        discount,
        transaction: t,
      });

      const finalDollarPrice =
        Number(setting?.dollar_price) + Number(setting?.bonus_dollar);

      const order = await createOrderRecord({
        user,
        provider: req.body.gateway,
        userChallenge,
        gateway: req.body.gateway,
        transaction: t,
        admin_id: req?.admin?.id,
        coupon,

        paymentPlan: req?.body?.payment_type,
        installmentNumber: req?.body?.payment_type === "full" ? 0 : 1,
        orderGroupId,
        baseAmountUsd: prices?.price_based,
        baseAmountIrr: prices?.price_based * finalDollarPrice * 10,
        insuranceAmountUsd: prices?.insurance_amount,
        insuranceAmountIrr: prices?.insurance_amount * finalDollarPrice * 10,
        discountUsd: prices?.discount_usd,
        discountIrr: prices?.discount_usd * finalDollarPrice * 10,
        amountUsd: prices?.final_price_usd,
        amountIrr: prices?.final_price_usd * finalDollarPrice * 10,
      });

      return {
        userChallenge,
        floatingRisk: floatingRiskRow,
        order,
      };
    });

    return result;
  } catch (err) {
    // ⚠️ قبلاً next(err) صدا زده می‌شد: هم error handler اکسپرس پاسخ
    // می‌فرستاد و هم فراخواننده (که undefined می‌گرفت) پاسخ دوم را
    // ⇒ ERR_HTTP_HEADERS_SENT و گم شدن پیام واقعی خطا.
    // فراخواننده‌ها catch دارند و err.status/err.message را برمی‌گردانند.
    throw err;
  }
}

module.exports = purchaseChallenge;
