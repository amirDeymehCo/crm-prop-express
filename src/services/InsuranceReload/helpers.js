const Order = require("../../models/Order");
const Setting = require("../../models/Setting");
const AccountInstance = require("../../models/Challenge/AccountInstance");
const splitInstallmentAmount = require("../PaymentPlan/SplitInstallmentAmount");
const { INSURANCE_DISCOUNT_PERCENT } = require("./constants");

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function getDiscountPercent(phaseIndex) {
  return Number(INSURANCE_DISCOUNT_PERCENT[Number(phaseIndex)] ?? 0);
}

/**
 * نرخ دلار لحظه‌ی ساخت سفارش (همون فرمولی که BuyCh استفاده می‌کنه)
 */
async function getDollarPrice(transaction) {
  const setting = await Setting.findByPk(1, { transaction });
  return (
    Number(setting?.dollar_price || 0) + Number(setting?.bonus_dollar || 0)
  );
}

/**
 * قیمت پایه‌ی چالش (بدون هزینه بیمه).
 *
 * اسنپ‌شات لحظه‌ی خرید اولویت داره تا اگه قیمت پلن بعداً عوض شد،
 * کاربر با همون قیمتی که خریده بود چالش جایگزین بگیره.
 */
function getBasePriceUsd(userChallenge, plan) {
  const snapshotPrice = Number(
    userChallenge?.rules_snapshot?.plan?.price_usd ?? NaN,
  );

  if (Number.isFinite(snapshotPrice) && snapshotPrice > 0) {
    return snapshotPrice;
  }

  return Number(plan?.price_usd || 0);
}

/**
 * محاسبه‌ی مبالغ چالش جایگزین.
 *
 * ⚠️ تخفیف روی «مبلغ پایه‌ای که کاربر تا این لحظه واقعاً پرداخت کرده»
 * حساب می‌شود، نه روی کل قیمت پلن — و حق بیمه هم در این پایه حساب نمی‌شود.
 *
 * مثال: پلن ۱۰ دلار + بیمه ۳ دلار، قسطی.
 * کاربر قسط اول (۶.۵ = ۵ پایه + ۱.۵ بیمه) را داده و در فاز ۱ رد شده:
 *   تخفیف   = ۴۰٪ × ۵  = ۲ دلار
 *   قیمت جدید = ۱۰ − ۲ = ۸ دلار  →  قسطی: ۴ + ۴
 *
 * چالش جایگزین بیمه ندارد، پس کل مبلغ = قیمت پایه منهای همین تخفیف.
 */
function buildReloadPricing({
  basePriceUsd,
  paidBaseUsd,
  phaseIndex,
  paymentPlan,
  dollarPrice,
}) {
  const baseUsd = round2(basePriceUsd);
  const paidBase = round2(paidBaseUsd);
  const percent = getDiscountPercent(phaseIndex);

  // تخفیف هیچوقت نباید از خود قیمت چالش بیشتر شود
  const discountUsd = Math.min(round2(paidBase * (percent / 100)), baseUsd);

  const payableUsd = round2(baseUsd - discountUsd);
  const payableIrr = Math.round(payableUsd * dollarPrice * 10);

  const common = {
    percent,
    baseUsd,
    paidBaseUsd: paidBase,
    discountUsd,
    discountIrr: Math.round(discountUsd * dollarPrice * 10),
    payableUsd,
    payableIrr,
  };

  if (paymentPlan !== "installment") {
    return {
      ...common,
      first: {
        baseUsd: payableUsd,
        baseIrr: payableIrr,
        totalUsd: payableUsd,
        totalIrr: payableIrr,
      },
      second: null,
    };
  }

  const split = splitInstallmentAmount({
    totalBaseUsd: payableUsd,
    totalBaseIrr: payableIrr,
    totalInsuranceUsd: 0,
    totalInsuranceIrr: 0,
  });

  return { ...common, first: split.first, second: split.second };
}

/**
 * مبلغ پایه‌ای که کاربر تا این لحظه بابت این چالش پرداخت کرده (بدون حق بیمه).
 *
 * ChallengeFinalize بعد از هر پرداخت موفق، base_amount_usd همان سفارش را
 * روی این ستون جمع می‌زند؛ پس اگر فقط قسط اول پرداخت شده باشد، فقط سهم
 * پایه‌ی همان قسط اینجاست.
 */
function getPaidBaseUsd(userChallenge) {
  return Number(userChallenge?.paid_base_amount_usd || 0);
}

/**
 * درگاهی که کاربر دفعه‌ی قبل باهاش پرداخت کرده.
 * صرفاً مقدار اولیه‌ی Order است؛ کاربر موقع پرداخت می‌تواند عوضش کند.
 */
async function getLastGateway(userChallengeId, transaction) {
  const lastOrder = await Order.findOne({
    where: { user_challenge_id: userChallengeId, status: "paid" },
    order: [["id", "DESC"]],
    attributes: ["gateway"],
    transaction,
  });

  return lastOrder?.gateway ?? "peykan";
}

/**
 * حسابِ معاملاتی‌ای که کاربر باهاش رد شده.
 *
 * اول دنبال حسابِ همان فازی می‌گردیم که چالش در آن بسته شده (آخرین سایکل)،
 * و اگر پیدا نشد آخرین حساب همان چالش را برمی‌داریم.
 */
async function getFailedAccount(userChallengeId, phaseIndex, transaction) {
  const attributes = [
    "id",
    "phase_index",
    "cycle_no",
    "platform",
    "mt_login",
    "platform_login",
    "mt_server",
    "status",
  ];

  const inPhase = await AccountInstance.findOne({
    where: { user_challenge_id: userChallengeId, phase_index: phaseIndex },
    order: [
      ["cycle_no", "DESC"],
      ["id", "DESC"],
    ],
    attributes,
    transaction,
  });

  if (inPhase) return inPhase;

  return AccountInstance.findOne({
    where: { user_challenge_id: userChallengeId },
    order: [["id", "DESC"]],
    attributes,
    transaction,
  });
}

/**
 * شناسه‌ی خواناى حساب برای نوشتن داخل متن لاگ
 */
function describeAccount(account) {
  if (!account) return "بدون حساب";

  const login = account.mt_login || account.platform_login;
  const platform = account.platform ? ` / ${account.platform}` : "";

  return login ? `${login}${platform}` : `#${account.id}${platform}`;
}

/**
 * دیتای ساختاریافته‌ی منشأ بیمه — همان چیزی که هم داخل rules_snapshot
 * چالش جدید و هم داخل meta سفارش جدید ذخیره می‌شود تا دو طرف به هم وصل باشند.
 */
function buildInsuranceOrigin({
  userChallenge,
  phaseIndex,
  pricing,
  failedAccount,
}) {
  return {
    created_by_insurance: true,
    insurance_source_challenge_id: userChallenge.id,
    insurance_failed_phase_index: Number(phaseIndex),
    insurance_failed_account_id: failedAccount?.id ?? null,
    insurance_failed_account_login:
      failedAccount?.mt_login || failedAccount?.platform_login || null,
    insurance_failed_account_platform: failedAccount?.platform ?? null,
    insurance_discount_percent: pricing.percent,
    insurance_discount_usd: pricing.discountUsd,
    insurance_paid_base_usd: pricing.paidBaseUsd,
  };
}

/**
 * اسنپ‌شات قوانین چالش جدید: همان قوانین چالش قبلی،
 * به‌علاوه‌ی ردّ منشأ بیمه (چون ستون رابطه‌ای بین دو چالش نداریم).
 */
function buildReloadSnapshot({ userChallenge, origin }) {
  const source = userChallenge.rules_snapshot || {};

  return {
    ...source,
    meta: {
      ...(source.meta || {}),
      is_free_challenge: false,
      profit_target_swapped: false,
      ...origin,
    },
  };
}

module.exports = {
  round2,
  getDiscountPercent,
  getDollarPrice,
  getBasePriceUsd,
  getPaidBaseUsd,
  buildReloadPricing,
  getLastGateway,
  getFailedAccount,
  describeAccount,
  buildInsuranceOrigin,
  buildReloadSnapshot,
};
