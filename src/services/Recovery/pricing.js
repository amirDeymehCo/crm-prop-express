const { Op } = require("sequelize");

const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const { RECOVERY_ORDER_TYPE } = require("./constants");
const { round2, parseJsonField } = require("./helpers");

/**
 * منبعی که قیمت پایه از آن خوانده شده — عیناً به PHP برمی‌گردد تا کارشناس فروش
 * بداند عددی که می‌بیند چقدر قابل اتکاست.
 */
const PRICE_SOURCE = {
  SNAPSHOT: "rules_snapshot", // اسنپ‌شات لحظه‌ی خرید — دقیق‌ترین
  PLAN: "plan", // قیمت فعلی پلنِ همین چالش
  PLAN_BY_TYPE_BALANCE: "plan_by_type_balance", // پلن پیدا شد از روی تایپ + بالانس حساب
  CHALLENGE_ROW: "challenge_row", // ستون price_usd خود چالش
  UNKNOWN: "unknown", // هیچ‌کدام — قیمت صفر برگشت
};

const PAID_SOURCE = {
  ORDERS: "orders", // جمع سفارش‌های پرداخت‌شده‌ی واقعی
  CHALLENGE_ROW: "challenge_row", // ستون paid_amount_usd چالش
  NONE: "none", // هیچ پرداخت واقعی‌ای پیدا نشد (سفارش دستی/صفر)
};

/**
 * مبلغ واقعی یک سفارش.
 *
 * ⚠️ سفارش‌هایی که دستی/از سیستم قبلی آمده‌اند (عموماً gateway = "admin")
 * final_amount_usd صفر دارند در حالی که مبلغ واقعی در amount_usd نشسته.
 * از طرف دیگر، سفارش رایگانِ واقعی (کوپن ۱۰۰٪) هم final صفر دارد ولی
 * واقعاً چیزی پرداخت نشده. این دو را از روی گیت‌وی/تخفیف/کوپن جدا می‌کنیم.
 */
function orderAmountUsd(order) {
  const final = Number(order?.final_amount_usd ?? 0);

  if (final > 0) return round2(final);

  const isGenuinelyFree =
    order?.gateway === "coupon_free" ||
    Number(order?.discount_usd || 0) > 0 ||
    Boolean(order?.coupon_code_snapshot);

  if (isGenuinelyFree) return 0;

  return round2(Number(order?.amount_usd ?? 0));
}

/**
 * حق بیمه — آینه‌ی دقیق calculateInsurance در BuyCh/CreateCh.js
 */
function calcInsuranceFeeUsd(plan, withInsurance) {
  if (!withInsurance || !plan?.allow_insurance) return 0;

  switch (plan.insurance_fee_type) {
    case "percent_of_price":
      return round2(
        Number(plan.price_usd || 0) * (Number(plan.insurance_value || 0) / 100),
      );
    case "percent_of_balance":
      return round2(
        Number(plan.balance || 0) * (Number(plan.insurance_value || 0) / 100),
      );
    case "fixed":
      return round2(Number(plan.insurance_value || 0));
    default:
      return 0;
  }
}

/**
 * هزینه‌ی ریسک شناور — آینه‌ی calculateFloatingRiskFee در CreateCh.js
 *
 * سیاست پروژه برعکس چیزی است که به‌نظر می‌رسد: اگر پلن ریسک شناور دارد و کاربر
 * آن را **خاموش** کند، هزینه به قیمت اضافه می‌شود؛ روشن بودنش مجانی است.
 */
function calcFloatingRiskFeeUsd(plan, floatingRiskEnabled) {
  if (!plan?.has_floating_risk) return 0;
  if (floatingRiskEnabled === false) return round2(Number(plan.floating_risk_fee || 0));

  return 0;
}

/**
 * بالانسی که این چالش با آن خریده شده.
 *
 * برای سفارش‌های دستی که پلنشان پیدا نمی‌شود، همین عدد کلید پیدا کردن پلن است.
 */
function resolveBalanceUsd({ userChallenge, plan, account }) {
  const snapshot = parseJsonField(userChallenge?.rules_snapshot);

  const candidates = [
    snapshot?.plan?.balance,
    plan?.balance,
    account?.starting_balance_usd,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

/**
 * پلن‌های جایگزین را برای چالش‌هایی که پلنشان قیمت ندارد، دسته‌ای می‌خواند.
 *
 * خروجی یک تابع match است: (challenge_type_id, balance) → plan | null
 *
 * @param {Array<{challengeTypeId:number, balanceUsd:number}>} needs
 */
async function buildFallbackPlanMatcher(needs, transaction) {
  const typeIds = [
    ...new Set(
      (needs || [])
        .map((n) => Number(n.challengeTypeId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];

  if (!typeIds.length) return () => null;

  const plans = await ChallengePlan.findAll({
    where: {
      challenge_type_id: { [Op.in]: typeIds },
      price_usd: { [Op.gt]: 0 },
    },
    attributes: [
      "id",
      "challenge_type_id",
      "title",
      "balance",
      "price_usd",
      "allow_insurance",
      "insurance_fee_type",
      "insurance_value",
      "has_floating_risk",
      "floating_risk_fee",
    ],
    transaction,
  });

  // کلید: `${type}:${balance}` — بالانس به عدد نرمال می‌شود تا 1000 و 1000.00 یکی شوند
  const byTypeBalance = new Map();

  for (const plan of plans) {
    const key = `${plan.challenge_type_id}:${Number(plan.balance)}`;

    if (!byTypeBalance.has(key)) byTypeBalance.set(key, plan);
  }

  return (challengeTypeId, balanceUsd) => {
    if (!challengeTypeId || !Number.isFinite(Number(balanceUsd))) return null;

    return byTypeBalance.get(`${challengeTypeId}:${Number(balanceUsd)}`) || null;
  };
}

/**
 * آیا این چالش برای محاسبه‌ی قیمت به پلن جایگزین نیاز دارد؟
 *
 * وقتی نه اسنپ‌شات قیمت دارد و نه پلنِ متصل، یعنی سفارش دستی است.
 */
function needsFallbackPlan({ userChallenge, plan }) {
  const snapshot = parseJsonField(userChallenge?.rules_snapshot);

  if (Number(snapshot?.plan?.price_usd || 0) > 0) return false;
  if (Number(plan?.price_usd || 0) > 0) return false;

  return true;
}

/**
 * قیمت یک چالش را از هر منبعی که در دسترس باشد در می‌آورد.
 *
 * ⚠️ چرا این‌قدر fallback: بخشی از چالش‌ها دستی از سیستم قبلی مهاجرت کرده‌اند و
 * سفارششان با مبلغ صفر ثبت شده؛ برای آن‌ها هیچ رکورد پرداختی وجود ندارد و قیمت
 * باید از پلن/تایپ/بالانس بازسازی شود، وگرنه کارشناس فروش عدد صفر می‌بیند و
 * نمی‌داند روی چه مبلغی تخفیف بدهد.
 *
 * @param {object}   params
 * @param {object}   params.userChallenge
 * @param {object}   [params.plan]        پلن متصل به چالش
 * @param {object}   [params.account]     حساب معاملاتی (برای بالانس)
 * @param {Array}    [params.paidOrders]  سفارش‌های پرداخت‌شده‌ی همین چالش
 * @param {Function} [params.matchPlan]   خروجی buildFallbackPlanMatcher
 */
function resolveChallengePricing({
  userChallenge,
  plan = null,
  account = null,
  paidOrders = [],
  matchPlan = null,
}) {
  const snapshot = parseJsonField(userChallenge?.rules_snapshot);
  const balanceUsd = resolveBalanceUsd({ userChallenge, plan, account });

  // ── قیمت پایه ──
  let basePriceUsd = 0;
  let priceSource = PRICE_SOURCE.UNKNOWN;
  let pricingPlan = plan;

  const snapshotPrice = Number(snapshot?.plan?.price_usd || 0);
  const livePlanPrice = Number(plan?.price_usd || 0);

  if (snapshotPrice > 0) {
    basePriceUsd = round2(snapshotPrice);
    priceSource = PRICE_SOURCE.SNAPSHOT;
  } else if (livePlanPrice > 0) {
    basePriceUsd = round2(livePlanPrice);
    priceSource = PRICE_SOURCE.PLAN;
  } else {
    // سفارش دستی: پلن را از روی تایپ + بالانس پیدا کن
    const fallback = matchPlan
      ? matchPlan(Number(userChallenge?.challenge_type_id), balanceUsd)
      : null;

    if (Number(fallback?.price_usd || 0) > 0) {
      basePriceUsd = round2(Number(fallback.price_usd));
      priceSource = PRICE_SOURCE.PLAN_BY_TYPE_BALANCE;
      pricingPlan = fallback;
    } else {
      // آخرین راه: ستون price_usd خود چالش.
      // ⚠️ فقط برای خرید یکجا معتبر است — در خرید قسطی این ستون مبلغ
      // «قسط اول» را نگه می‌دارد نه کل قیمت، پس عدد را نصف نشان می‌دهد.
      const rowPrice = Number(userChallenge?.price_usd || 0);

      if (rowPrice > 0 && userChallenge?.payment_plan !== "installment") {
        basePriceUsd = round2(rowPrice);
        priceSource = PRICE_SOURCE.CHALLENGE_ROW;
      }
    }
  }

  // ── حق بیمه ──
  const storedInsurance = Number(userChallenge?.insurance_fee_usd || 0);

  const insuranceFeeUsd =
    storedInsurance > 0
      ? round2(storedInsurance)
      : calcInsuranceFeeUsd(pricingPlan, Boolean(userChallenge?.has_insurance));

  // ── هزینه ریسک شناور ──
  const floatingRiskFeeUsd = calcFloatingRiskFeeUsd(
    pricingPlan,
    userChallenge?.floating_risk_enabled,
  );

  const listTotalUsd = round2(
    basePriceUsd + insuranceFeeUsd + floatingRiskFeeUsd,
  );

  // ── پرداخت‌های واقعی ──
  // سفارش‌های خودِ بازیابی کنار گذاشته می‌شوند تا این عدد همان «پولی که بابت
  // خرید اصلی داده» بماند و مبنای تخفیف را جابه‌جا نکند.
  const purchaseOrders = (paidOrders || []).filter(
    (o) => o.type !== RECOVERY_ORDER_TYPE,
  );

  const ordersSum = purchaseOrders.reduce(
    (sum, o) => sum + orderAmountUsd(o),
    0,
  );

  const rowPaid = Number(userChallenge?.paid_amount_usd || 0);

  let paidTotalUsd = 0;
  let paidSource = PAID_SOURCE.NONE;

  if (ordersSum > 0) {
    paidTotalUsd = round2(ordersSum);
    paidSource = PAID_SOURCE.ORDERS;
  } else if (rowPaid > 0) {
    paidTotalUsd = round2(rowPaid);
    paidSource = PAID_SOURCE.CHALLENGE_ROW;
  }

  const lastPaid =
    purchaseOrders.filter((o) => orderAmountUsd(o) > 0).at(0) ?? null;

  return {
    // مبنای تخفیف: قیمت پایه‌ی پلن
    original_price_usd: basePriceUsd,
    price_source: priceSource,

    insurance_fee_usd: insuranceFeeUsd,
    floating_risk_fee_usd: floatingRiskFeeUsd,

    // کل مبلغی که این چالش با همین پلن/تایپ/بالانس در می‌آید
    list_total_usd: listTotalUsd,

    paid_total_usd: paidTotalUsd,
    paid_source: paidSource,
    last_paid_amount_usd: lastPaid ? orderAmountUsd(lastPaid) : null,
    last_paid_at: lastPaid?.paid_at ?? null,

    // true یعنی رکورد پرداخت واقعی نداشت و عددها از پلن بازسازی شده‌اند
    // (سفارش‌های دستیِ مهاجرت‌شده)
    is_estimated: paidSource === PAID_SOURCE.NONE,

    balance_usd: balanceUsd,
    pricing_plan_id: pricingPlan?.id ?? null,
  };
}

module.exports = {
  PRICE_SOURCE,
  PAID_SOURCE,
  orderAmountUsd,
  calcInsuranceFeeUsd,
  calcFloatingRiskFeeUsd,
  resolveBalanceUsd,
  buildFallbackPlanMatcher,
  needsFallbackPlan,
  resolveChallengePricing,
};
