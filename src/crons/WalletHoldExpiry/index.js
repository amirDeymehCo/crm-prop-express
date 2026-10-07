const cron = require("node-cron");

const { expireDueWalletHolds } = require("../../services/WalletHold");

/**
 * برگشت خودکار وجه رزروهای منقضی‌شده‌ی ولت.
 *
 * هر دقیقه اجرا می‌شود؛ پس حداکثر تاخیر برگشت پول یک دقیقه است. کوتاه‌تر از
 * این لازم نیست و کوئری‌اش هم با ایندکس (status, expires_at) سبک است.
 *
 * اجرای موازی ممکن نیست: اگر تیک قبلی تمام نشده باشد تیک جدید رد می‌شود.
 * (برگشت دوباره‌ی یک رزرو هم ممکن نیست؛ ردیف داخل transaction قفل می‌شود.)
 */
let running = false;

async function runWalletHoldExpiry() {
  if (running) {
    console.warn("[wallet-hold] tick skipped — previous run still going");
    return null;
  }

  running = true;

  try {
    const result = await expireDueWalletHolds();

    if (result.refunded || result.failed) {
      console.log(
        `[wallet-hold] expiry — scanned=${result.scanned} refunded=${result.refunded} failed=${result.failed}`,
      );
    }

    return result;
  } catch (err) {
    console.error("[wallet-hold] expiry cron error:", err?.message);
    return null;
  } finally {
    running = false;
  }
}

cron.schedule("* * * * *", () => {
  runWalletHoldExpiry();
});

module.exports = runWalletHoldExpiry;
