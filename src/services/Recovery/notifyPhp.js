const axios = require("axios");
const axiosRetry = require("axios-retry").default;

const ChallengeRecovery = require("../../models/ChallengeRecovery");

const { CALLBACK_STATUS } = require("./constants");
const { parseJsonField } = require("./helpers");

/**
 * فراخوانی سرویس PHP بعد از پرداخت موفق بازیابی.
 *
 * قرارداد (از تیم PHP):
 *
 *   POST https://propmanager.myprop.trade/api/recovery/paid
 *   X-API-Key: <همان PARTNER_API_KEY>
 *   { "mt_login": "520114" }
 *
 * بدنه عمداً دقیقاً همین یک فیلد است و نه بیشتر. اگر بعداً فیلد دیگری خواستند
 * (مثلاً phase_index یا recovery_id) فقط buildPayload عوض می‌شود.
 *
 * تا وقتی PHP_RECOVERY_CALLBACK_URL ست نشده باشد، رکورد روی
 * callback_status = "pending" می‌ماند و با retryPendingCallbacks بعداً ارسال
 * می‌شود — پرداخت کاربر به‌هیچ‌وجه به این فراخوانی گره نخورده است.
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
 * بدنه‌ای که به PHP پست می‌شود — عیناً قرارداد بالا.
 *
 * sync است و هیچ کوئری‌ای نمی‌زند؛ mt_login روی خود رکورد بازیابی اسنپ‌شات شده.
 */
function buildPayload(recovery) {
  return { mt_login: recovery.mt_login };
}

/**
 * کلیدی که در هدر X-API-Key فرستاده می‌شود.
 *
 * طبق تصمیم خودِ تیم، همان PARTNER_API_KEY است. اگر روزی خواستند کلید
 * رفت‌و‌برگشت جدا باشد، فقط PHP_RECOVERY_API_KEY را در .env پر کنید و همین
 * تابع ترجیحش می‌دهد — جای دیگری لازم نیست عوض شود.
 */
function outboundApiKey() {
  return process.env.PHP_RECOVERY_API_KEY || process.env.PARTNER_API_KEY || null;
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

  const payload = buildPayload(recovery);

  try {
    const headers = {};
    const apiKey = outboundApiKey();

    if (apiKey) {
      headers["X-API-Key"] = apiKey;
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

module.exports = {
  notifyPhpRecoveryPaid,
  retryPendingCallbacks,
  buildPayload,
  outboundApiKey,
};
