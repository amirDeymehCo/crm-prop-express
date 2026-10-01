const { Op } = require("sequelize");

const Setting = require("../../models/Setting");
const Order = require("../../models/Order");
const User = require("../../models/User");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const ChallengeType = require("../../models/Challenge/ChallengeType");
const ChallengePhase = require("../../models/Challenge/ChallengePhase");
const AccountInstance = require("../../models/Challenge/AccountInstance");
const splitInstallmentAmount = require("../PaymentPlan/SplitInstallmentAmount");

const { PHASE_STATUS, MAX_LOOKUP_LOGINS } = require("./constants");

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * ستون‌های «JSON» این دیتابیس در عمل longtext هستند و Sequelize مقدارشان را
 * به‌صورت رشته برمی‌گرداند نه آبجکت. بدون این تابع، هم `obj.meta?.x` همیشه
 * undefined می‌شود و هم `{ ...obj.meta }` رشته را حرف‌به‌حرف پخش می‌کند.
 */
function parseJsonField(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * نرخ دلار همان فرمول همیشگی پروژه: (dollar_price + bonus_dollar) و بعد ×۱۰
 * برای تبدیل تومان به ریال.
 */
async function getDollarPrice(transaction) {
  const setting = await Setting.findByPk(1, { transaction });

  return (
    Number(setting?.dollar_price || 0) + Number(setting?.bonus_dollar || 0)
  );
}

function toIrr(usd, dollarPrice) {
  return Math.round(Number(usd || 0) * Number(dollarPrice || 0) * 10);
}

/**
 * ورودی را به آرایه‌ای از رشته‌های یکتا و تمیز تبدیل می‌کند.
 */
function normalizeLogins(input) {
  const list = Array.isArray(input) ? input : [input];

  const cleaned = list
    .map((v) => (v === null || v === undefined ? "" : String(v).trim()))
    .filter(Boolean);

  return [...new Set(cleaned)];
}

/**
 * قیمت پایه‌ی چالش. اسنپ‌شات لحظه‌ی خرید اولویت دارد تا اگر قیمت پلن بعداً
 * عوض شده باشد، «قیمت قبلی» که به فروشنده نشان می‌دهیم همانی باشد که کاربر
 * واقعاً خریده بود.
 */
function getBasePriceUsd(userChallenge, plan) {
  const snapshot = parseJsonField(userChallenge?.rules_snapshot);

  const snapshotPrice = Number(snapshot?.plan?.price_usd ?? NaN);

  if (Number.isFinite(snapshotPrice) && snapshotPrice > 0) {
    return round2(snapshotPrice);
  }

  return round2(Number(plan?.price_usd || 0));
}

function phaseStatusFor(phaseIndex) {
  return PHASE_STATUS[Number(phaseIndex)] || PHASE_STATUS[1];
}

/**
 * تقسیم مبلغ پیشنهادی بین اقساط.
 *
 * بازیابی بیمه ندارد، پس کل مبلغ «پایه» است.
 */
function buildRecoveryPricing({ offerPriceUsd, paymentPlan, dollarPrice }) {
  const totalUsd = round2(offerPriceUsd);
  const totalIrr = toIrr(totalUsd, dollarPrice);

  if (paymentPlan !== "installment") {
    return {
      totalUsd,
      totalIrr,
      first: { totalUsd, totalIrr },
      second: null,
    };
  }

  const split = splitInstallmentAmount({
    totalBaseUsd: totalUsd,
    totalBaseIrr: totalIrr,
    totalInsuranceUsd: 0,
    totalInsuranceIrr: 0,
  });

  return {
    totalUsd,
    totalIrr,
    first: { totalUsd: split.first.totalUsd, totalIrr: split.first.totalIrr },
    second: {
      totalUsd: split.second.totalUsd,
      totalIrr: split.second.totalIrr,
    },
  };
}

/**
 * درگاهی که کاربر دفعه‌ی قبل باهاش پرداخت کرده؛ فقط مقدار اولیه‌ی Order است و
 * کاربر موقع پرداخت می‌تواند عوضش کند.
 */
async function getLastGateway(userChallengeId, transaction) {
  const lastOrder = await Order.findOne({
    where: { user_challenge_id: userChallengeId, status: "paid" },
    order: [["id", "DESC"]],
    attributes: ["gateway"],
    transaction,
  });

  const gateway = lastOrder?.gateway;

  // ولت/کوپن مقدار اولیه‌ی خوبی برای یک فاکتور جدید نیست
  return gateway === "peykan" || gateway === "nowpayments" ? gateway : "peykan";
}

/**
 * حساب‌های متناظر با لیستی از لاگین‌ها به همراه چالش، پلن و کاربرشان.
 *
 * فیلدها عمداً محدود شده‌اند؛ این API روی لیست‌های چندصدتایی صدا زده می‌شود.
 */
async function findAccountsByLogins(logins, transaction) {
  if (!logins.length) return [];

  return AccountInstance.findAll({
    where: {
      [Op.or]: [{ mt_login: logins }, { platform_login: logins }],
    },
    attributes: [
      "id",
      "user_id",
      "user_challenge_id",
      "phase_index",
      "cycle_no",
      "platform",
      "mt_login",
      "platform_login",
      "mt_server",
      "status",
      "starting_balance_usd",
      "display_balance_usd",
      "closed_at",
    ],
    include: [
      {
        model: UserChallenge,
        attributes: [
          "id",
          "user_id",
          "status",
          "current_phase_index",
          "platform",
          // برای پیدا کردن پلن جایگزین در سفارش‌های دستی
          "challenge_type_id",
          "challenge_plan_id",
          "payment_plan",
          "payment_status",
          "price_usd",
          "total_price_usd",
          "paid_amount_usd",
          "paid_base_amount_usd",
          "has_insurance",
          "insurance_status",
          // برای بازسازی مبلغ کل
          "insurance_fee_usd",
          "floating_risk_enabled",
          "rules_snapshot",
          "ended_at",
          "updatedAt",
        ],
        include: [
          {
            model: ChallengePlan,
            attributes: [
              "id",
              "title",
              "balance",
              "price_usd",
              // لازم برای محاسبه‌ی حق بیمه و هزینه ریسک شناور وقتی روی
              // خود چالش ذخیره نشده‌اند (سفارش‌های دستی)
              "allow_insurance",
              "insurance_fee_type",
              "insurance_value",
              "has_floating_risk",
              "floating_risk_fee",
            ],
            include: [{ model: ChallengeType, attributes: ["id", "name"] }],
          },
        ],
      },
      {
        model: User,
        attributes: [
          "id",
          "firstname",
          "lastname",
          "mobile",
          "email",
          "legacy_user_id",
        ],
      },
    ],
    order: [["id", "DESC"]],
    transaction,
  });
}

/**
 * تک‌حسابی همین کوئری بالا، ولی با قفل روی چالش (برای ساخت فاکتور).
 */
async function findAccountByLogin(login, transaction) {
  return AccountInstance.findOne({
    where: {
      [Op.or]: [{ mt_login: login }, { platform_login: login }],
    },
    order: [["id", "DESC"]],
    transaction,
  });
}

async function findPhaseId({ planId, phaseIndex, transaction }) {
  const phase = await ChallengePhase.findOne({
    where: { challenge_plan_id: planId, phase_index: Number(phaseIndex) },
    attributes: ["id"],
    transaction,
  });

  return phase?.id ?? null;
}

function fullName(user) {
  return [user?.firstname, user?.lastname].filter(Boolean).join(" ").trim();
}

module.exports = {
  round2,
  parseJsonField,
  getDollarPrice,
  toIrr,
  normalizeLogins,
  getBasePriceUsd,
  phaseStatusFor,
  buildRecoveryPricing,
  getLastGateway,
  findAccountsByLogins,
  findAccountByLogin,
  findPhaseId,
  fullName,
  MAX_LOOKUP_LOGINS,
};
