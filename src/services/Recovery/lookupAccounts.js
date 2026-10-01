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
  getBasePriceUsd,
  findAccountsByLogins,
  fullName,
} = require("./helpers");

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

  // آخرین سفارش پرداخت‌شده‌ی هر چالش — «قیمتی که دفعه‌ی قبل داد»
  const paidOrders = challengeIds.length
    ? await Order.findAll({
        where: { user_challenge_id: challengeIds, status: "paid" },
        attributes: ["id", "user_challenge_id", "final_amount_usd", "paid_at"],
        order: [["id", "DESC"]],
      })
    : [];

  const lastPaidByChallenge = new Map();

  for (const order of paidOrders) {
    if (!lastPaidByChallenge.has(order.user_challenge_id)) {
      lastPaidByChallenge.set(order.user_challenge_id, order);
    }
  }

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
    const lastPaid = lastPaidByChallenge.get(challenge.id) || null;

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

      pricing: {
        // قیمت پایه‌ی پلن در لحظه‌ی خرید
        original_price_usd: getBasePriceUsd(challenge, plan),
        // مجموع چیزی که تا امروز بابت این چالش پرداخت کرده
        paid_total_usd: round2(challenge.paid_amount_usd || 0),
        // آخرین فاکتور پرداخت‌شده
        last_paid_amount_usd: lastPaid ? round2(lastPaid.final_amount_usd) : null,
        last_paid_at: lastPaid?.paid_at ?? null,
      },

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
