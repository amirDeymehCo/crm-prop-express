const ChallengeRecovery = require("../../models/ChallengeRecovery");
const Order = require("../../models/Order");

const {
  RECOVERY_STATUS,
  RECOVERABLE_CHALLENGE_STATUS,
  MAX_LOOKUP_LOGINS,
} = require("./constants");

const {
  round2,
  normalizeLogins,
  findAccountsByLogins,
  fullName,
} = require("./helpers");

const {
  buildFallbackPlanMatcher,
  needsFallbackPlan,
  resolveChallengePricing,
} = require("./pricing");

/**
 * دلیل اینکه یک حساب قابل بازیابی نیست — همین کدها عیناً به PHP برمی‌گردند.
 */
const INELIGIBLE = {
  ACCOUNT_NOT_FOUND: "account_not_found",
  CHALLENGE_NOT_FOUND: "challenge_not_found",
  CHALLENGE_NOT_CLOSED: "challenge_not_closed",
  RECOVERY_IN_PROGRESS: "recovery_in_progress",
};

/**
 * استعلام دسته‌ای حساب‌ها برای تیم فروش.
 *
 * PHP لیستی از mt_login می‌فرستد و برای هرکدام اطلاعات کاربر، چالش و قیمت
 * قبلی را می‌گیرد تا کارشناس بتواند تماس بگیرد و پیشنهاد قیمت بدهد.
 *
 * خروجی عمداً کم‌حجم است: نه rules_snapshot برمی‌گردد نه تاریخچه، چون این
 * متد روی لیست‌های چندصدتایی صدا زده می‌شود.
 *
 * @param {object}   params
 * @param {string[]} params.mt_logins
 */
async function lookupRecoveryAccounts({ mt_logins }) {
  const logins = normalizeLogins(mt_logins);

  if (!logins.length) {
    throw Object.assign(new Error("لیست mt_login خالی است"), { status: 400 });
  }

  if (logins.length > MAX_LOOKUP_LOGINS) {
    throw Object.assign(
      new Error(`حداکثر ${MAX_LOOKUP_LOGINS} لاگین در هر درخواست مجاز است`),
      { status: 400 },
    );
  }

  const accounts = await findAccountsByLogins(logins);

  // اگر یک لاگین به چند رکورد خورد (نباید عادی باشد) جدیدترین ملاک است؛
  // کوئری با id DESC مرتب شده پس اولین برخورد همان جدیدترین است.
  const byLogin = new Map();

  for (const account of accounts) {
    for (const key of [account.mt_login, account.platform_login]) {
      if (key && !byLogin.has(String(key))) {
        byLogin.set(String(key), account);
      }
    }
  }

  const challengeIds = [
    ...new Set(
      [...byLogin.values()]
        .map((a) => a.user_challenge_id)
        .filter((id) => id !== null && id !== undefined),
    ),
  ];

  // پیشنهادهای باز (پرداخت‌نشده یا نیمه‌پرداخت) تا فروشنده بداند قبلاً
  // فاکتوری ثبت شده یا نه
  const openRecoveries = challengeIds.length
    ? await ChallengeRecovery.findAll({
        where: {
          user_challenge_id: challengeIds,
          status: [RECOVERY_STATUS.PENDING_PAYMENT, RECOVERY_STATUS.PARTIALLY_PAID],
        },
        attributes: [
          "id",
          "user_challenge_id",
          "status",
          "offer_price_usd",
          "payment_plan",
          "first_amount_usd",
          "second_amount_usd",
          "paid_amount_usd",
          "external_ref",
          "agent_label",
          "expires_at",
          "createdAt",
        ],
        order: [["id", "DESC"]],
      })
    : [];

  const recoveryByChallenge = new Map();

  for (const rec of openRecoveries) {
    if (!recoveryByChallenge.has(rec.user_challenge_id)) {
      recoveryByChallenge.set(rec.user_challenge_id, rec);
    }
  }

  // همه‌ی سفارش‌های پرداخت‌شده — مبنای «چقدر تا امروز داده»
  const paidOrders = challengeIds.length
    ? await Order.findAll({
        where: { user_challenge_id: challengeIds, status: "paid" },
        attributes: [
          "id",
          "user_challenge_id",
          "type",
          "gateway",
          "amount_usd",
          "discount_usd",
          "final_amount_usd",
          "coupon_code_snapshot",
          "paid_at",
        ],
        order: [["id", "DESC"]],
      })
    : [];

  const paidByChallenge = new Map();

  for (const order of paidOrders) {
    const list = paidByChallenge.get(order.user_challenge_id) || [];
    list.push(order);
    paidByChallenge.set(order.user_challenge_id, list);
  }

  // سفارش‌های دستی: نه اسنپ‌شات قیمت دارند نه پلنِ قیمت‌دار؛ برای آن‌ها پلن را
  // از روی تایپ + بالانسِ حساب پیدا می‌کنیم.
  const fallbackNeeds = [];

  for (const account of byLogin.values()) {
    const challenge = account.UserChallenge;

    if (!challenge) continue;

    const needs = needsFallbackPlan({
      userChallenge: challenge,
      plan: challenge.ChallengePlan,
    });

    if (needs) {
      fallbackNeeds.push({
        challengeTypeId: Number(challenge.challenge_type_id),
        balanceUsd: Number(account.starting_balance_usd || 0),
      });
    }
  }

  const matchPlan = await buildFallbackPlanMatcher(fallbackNeeds);

  const items = logins.map((login) => {
    const account = byLogin.get(login);

    if (!account) {
      return { mt_login: login, found: false, eligible: false, reason: INELIGIBLE.ACCOUNT_NOT_FOUND };
    }

    const challenge = account.UserChallenge;

    if (!challenge) {
      return { mt_login: login, found: false, eligible: false, reason: INELIGIBLE.CHALLENGE_NOT_FOUND };
    }

    const plan = challenge.ChallengePlan;
    const user = account.User;
    const recovery = recoveryByChallenge.get(challenge.id) || null;

    const pricing = resolveChallengePricing({
      userChallenge: challenge,
      plan,
      account,
      paidOrders: paidByChallenge.get(challenge.id) || [],
      matchPlan,
    });

    let reason = null;

    if (challenge.status !== RECOVERABLE_CHALLENGE_STATUS) {
      reason = INELIGIBLE.CHALLENGE_NOT_CLOSED;
    } else if (recovery && recovery.status === RECOVERY_STATUS.PARTIALLY_PAID) {
      // قسط اول پرداخت شده؛ تا تسویه نشود فاکتور جدید معنی ندارد
      reason = INELIGIBLE.RECOVERY_IN_PROGRESS;
    }

    return {
      mt_login: login,
      found: true,
      eligible: reason === null,
      reason,

      user: {
        id: user?.id ?? challenge.user_id,
        full_name: fullName(user),
        mobile: user?.mobile ?? null,
        email: user?.email ?? null,
        legacy_user_id: user?.legacy_user_id ?? null,
      },

      challenge: {
        id: challenge.id,
        status: challenge.status,
        phase_index: Number(account.phase_index || challenge.current_phase_index || 1),
        platform: account.platform || challenge.platform,
        plan_title: plan?.title ?? null,
        plan_balance_usd: plan?.balance != null ? Number(plan.balance) : null,
        challenge_type: plan?.ChallengeType?.name ?? null,
        payment_plan: challenge.payment_plan,
        closed_at: challenge.ended_at || account.closed_at || null,
      },

      account: {
        id: account.id,
        status: account.status,
        mt_server: account.mt_server ?? null,
        starting_balance_usd: Number(account.starting_balance_usd || 0),
      },

      pricing,

      open_recovery: recovery
        ? {
            id: recovery.id,
            status: recovery.status,
            offer_price_usd: round2(recovery.offer_price_usd),
            payment_plan: recovery.payment_plan,
            first_amount_usd: round2(recovery.first_amount_usd),
            second_amount_usd:
              recovery.second_amount_usd == null
                ? null
                : round2(recovery.second_amount_usd),
            paid_amount_usd: round2(recovery.paid_amount_usd),
            external_ref: recovery.external_ref,
            agent_label: recovery.agent_label,
            expires_at: recovery.expires_at,
            created_at: recovery.createdAt,
          }
        : null,
    };
  });

  return {
    requested: logins.length,
    found: items.filter((i) => i.found).length,
    eligible: items.filter((i) => i.eligible).length,
    items,
  };
}

module.exports = { lookupRecoveryAccounts, INELIGIBLE };
