const cron = require("node-cron");

const { sendExpiryReminders } = require("../../services/Recovery/reminders");

/**
 * یادآور پیامکیِ پایان مهلت بازیابی حساب.
 *
 * هر ۵ دقیقه اجرا می‌شود. این بازه از روی نزدیک‌ترین مرحله انتخاب شده: یادآور
 * «۳۰ دقیقه مانده» با بازه‌ی ۵ دقیقه‌ای حداکثر ۵ دقیقه دیر می‌رسد، که قابل
 * قبول است. بازه‌ی بزرگ‌تر باعث می‌شود پیامک ۳۰ دقیقه‌ای بعضی وقت‌ها بعد از
 * انقضا برود.
 *
 * ارسال تکراری ممکن نیست: هر مرحله قبل از ارسال روی ستون خودش رزرو می‌شود.
 */
let running = false;

async function runRecoveryReminders() {
  // اگر اجرای قبلی طول کشید (مثلاً کاوه‌نگار کند بود) اجرای جدید را رد کن
  if (running) {
    console.warn("[recovery] reminder tick skipped — previous run still going");
    return null;
  }

  running = true;

  try {
    const result = await sendExpiryReminders();

    if (result.sent || result.failed || result.skipped) {
      console.log(
        `[recovery] reminders — scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
      );
    }

    return result;
  } catch (err) {
    console.error("[recovery] reminder cron error:", err?.message);
    return null;
  } finally {
    running = false;
  }
}

cron.schedule("*/5 * * * *", () => {
  runRecoveryReminders();
});

module.exports = runRecoveryReminders;
