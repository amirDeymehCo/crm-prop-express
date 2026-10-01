const axios = require("axios");
const axiosRetry = require("axios-retry").default;

const ChallengeRecovery = require("../../models/ChallengeRecovery");
const User = require("../../models/User");
const AccountInstance = require("../../models/Challenge/AccountInstance");

const { CALLBACK_STATUS, RECOVERY_STATUS } = require("./constants");
const { parseJsonField } = require("./helpers");

/**
 * فراخوانی سرویس PHP بعد از پرداخت موفق بازیابی.
 *
 * ⚠️ آدرس و کلید این سرویس هنوز از تیم PHP نرسیده است. تا وقتی
 * PHP_RECOVERY_CALLBACK_URL ست نشده باشد، رکورد روی callback_status = "pending"
 * می‌ماند و با retryPendingCallbacks بعداً ارسال می‌شود — پرداخت کاربر به‌هیچ‌وجه
 * به این فراخوانی گره نخورده است.
 */
const client = axios.create({
  timeout: Number(process.env.PHP_RECOVERY_TIMEOUT || 15000),
  headers: { "Content-Type": "application/json" },
});

axiosRetry(client, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) ||
    err.code === "ECONNABORTED" ||
    err.code === "ECONNREFUSED" ||
    err.code === "ENOTFOUND",
});

/**
 * بدنه‌ای که به PHP پست می‌شود.
 *
 * اگر تیم PHP ساختار دیگری خواست، فقط همین تابع باید عوض شود.
 */
async function buildPayload(recovery) {
  const [user, account] = await Promise.all([
    User.findByPk(recovery.user_id, {
      attributes: ["id", "firstname", "lastname", "mobile", "email", "legacy_user_id"],
    }),
    recovery.account_instance_id
      ? AccountInstance.findByPk(recovery.account_instance_id, {
          attributes: [
            "id",
            "platform",
            "mt_login",
            "platform_login",
            "mt_server",
            "mt_group",
            "starting_balance_usd",
          ],
        })
      : null,
  ]);

  return {
    event: "challenge_recovery_paid",

    recovery_id: recovery.id,
    external_ref: recovery.external_ref,

    mt_login: recovery.mt_login,
    platform: account?.platform ?? null,
    mt_server: account?.mt_server ?? null,
    mt_group: account?.mt_group ?? null,

    user_challenge_id: recovery.user_challenge_id,
    account_instance_id: recovery.account_instance_id,

    // فازی که حساب باید در آن ادامه پیدا کند
    phase_index: recovery.phase_index,
    starting_balance_usd: account
      ? Number(account.starting_balance_usd || 0)
      : null,

    user: {
      id: user?.id ?? recovery.user_id,
      full_name: [user?.firstname, user?.lastname].filter(Boolean).join(" "),
      mobile: user?.mobile ?? null,
      email: user?.email ?? null,
      legacy_user_id: user?.legacy_user_id ?? null,
    },

    payment: {
      payment_plan: recovery.payment_plan,
      offer_price_usd: Number(recovery.offer_price_usd),
      paid_amount_usd: Number(recovery.paid_amount_usd),
      fully_paid: recovery.status === RECOVERY_STATUS.PAID,
      first_paid_at: recovery.first_paid_at,
      second_paid_at: recovery.second_paid_at,
    },

    revived_at: recovery.revived_at,
    sent_at: new Date().toISOString(),
  };
}

/**
 * یک تلاش برای اطلاع‌رسانی. هیچ‌وقت throw نمی‌کند — نتیجه روی خود رکورد
 * ذخیره می‌شود تا قابل پیگیری و ارسال مجدد باشد.
 */
async function notifyPhpRecoveryPaid(recoveryId) {
  const recovery = await ChallengeRecovery.findByPk(recoveryId);

  if (!recovery) {
    return { ok: false, reason: "recovery_not_found" };
  }

  if (recovery.callback_status === CALLBACK_STATUS.SENT) {
    return { ok: true, reason: "already_sent" };
  }

  const url = process.env.PHP_RECOVERY_CALLBACK_URL;

  if (!url) {
    await recovery.update({
      callback_last_error:
        "PHP_RECOVERY_CALLBACK_URL تنظیم نشده است؛ ارسال به صف ماند",
    });

    console.warn(
      `[recovery] callback skipped (URL not configured) recovery_id=${recovery.id}`,
    );

    return { ok: false, reason: "callback_url_not_configured" };
  }

  const payload = await buildPayload(recovery);

  try {
    const headers = {};

    if (process.env.PHP_RECOVERY_API_KEY) {
      headers["X-API-Key"] = process.env.PHP_RECOVERY_API_KEY;
    }

    const { status, data } = await client.post(url, payload, { headers });

    const ok = status >= 200 && status < 300 && data?.ok !== false;

    await recovery.update({
      callback_status: ok ? CALLBACK_STATUS.SENT : CALLBACK_STATUS.FAILED,
      callback_attempts: Number(recovery.callback_attempts || 0) + 1,
      callback_sent_at: ok ? new Date() : recovery.callback_sent_at,
      callback_last_error: ok
        ? null
        : `پاسخ نامعتبر از سرویس PHP: ${status} ${JSON.stringify(data).slice(0, 500)}`,
      meta: {
        ...(parseJsonField(recovery.meta) || {}),
        php_callback_response: data ?? null,
      },
    });

    return { ok, status, data };
  } catch (err) {
    const message =
      err?.response?.status != null
        ? `${err.response.status} ${JSON.stringify(err.response.data).slice(0, 500)}`
        : err?.message || "خطای نامشخص";

    await recovery.update({
      callback_status: CALLBACK_STATUS.FAILED,
      callback_attempts: Number(recovery.callback_attempts || 0) + 1,
      callback_last_error: message,
    });

    console.error(`[recovery] callback failed recovery_id=${recovery.id}:`, message);

    return { ok: false, error: message };
  }
}

/**
 * ارسال مجدد همه‌ی اطلاع‌رسانی‌های معلق/ناموفق.
 *
 * وقتی سرویس PHP آماده و URL ست شد، یک بار این را صدا بزنید تا هر پرداختی که
 * در این فاصله انجام شده به آن‌ها برسد.
 */
async function retryPendingCallbacks({ limit = 50 } = {}) {
  const pending = await ChallengeRecovery.findAll({
    where: {
      callback_status: [CALLBACK_STATUS.PENDING, CALLBACK_STATUS.FAILED],
      revived_at: { [require("sequelize").Op.ne]: null },
    },
    order: [["id", "ASC"]],
    limit,
    attributes: ["id"],
  });

  const results = [];

  for (const row of pending) {
    results.push({ recovery_id: row.id, ...(await notifyPhpRecoveryPaid(row.id)) });
  }

  return {
    attempted: results.length,
    sent: results.filter((r) => r.ok).length,
    results,
  };
}

module.exports = { notifyPhpRecoveryPaid, retryPendingCallbacks, buildPayload };
