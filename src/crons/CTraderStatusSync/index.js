const cron = require("node-cron");

const { runCTraderStatusSync } = require("../../services/CTraderStatusSync");
const { syncLog } = require("../../services/CTraderStatusSync/log");

/**
 * همگام‌سازی شبانه‌ی وضعیت حساب‌های cTrader.
 *
 * PHP زمان بسته شدن حساب به ما خبر نمی‌دهد، پس هر شب ساعت ۰۰:۰۰ (تهران)
 * همه‌ی حساب‌های فعال cTrader را ۴۰تا ۴۰تا استعلام می‌کنیم. این کار سنگین
 * است، برای همین فقط نیمه‌شب اجرا می‌شود و اگر تا ساعت ۶ صبح تمام نشد،
 * دسته‌ی جدید شروع نمی‌شود.
 *
 * تا وقتی CTRADER_SYNC_APPLY=true نشده فقط گزارش می‌دهد و چیزی را عوض
 * نمی‌کند.
 */
// سقف زمان اجرا (ساعت). از زمان شروع حساب می‌شود چون ساعت سرور ممکن است UTC باشد.
const MAX_HOURS = Number(process.env.CTRADER_SYNC_MAX_HOURS || 6);

let running = false;

async function runNightlySync() {
  if (running) {
    console.warn("[ctrader-sync] skipped — previous run still going");
    return null;
  }

  running = true;
  const startedAt = Date.now();

  const deadline = new Date(startedAt + MAX_HOURS * 60 * 60 * 1000);

  try {
    const stats = await runCTraderStatusSync({
      dryRun: process.env.CTRADER_SYNC_APPLY !== "true",
      batchSize: Number(process.env.CTRADER_SYNC_BATCH || 40),
      deadline,
    });

    console.log(
      `[ctrader-sync] done in ${Math.round((Date.now() - startedAt) / 1000)}s — ` +
        `dryRun=${stats.dryRun} checked=${stats.checked} active=${stats.stillActive} ` +
        `closedOnPlatform=${stats.closedOnPlatform} accountsFailed=${stats.accountsFailed} ` +
        `challengesClosed=${stats.challengesClosed} needsReview=${stats.needsReview} ` +
        `notFound=${stats.notFound} errors=${stats.errors} stoppedByDeadline=${stats.stoppedByDeadline}`,
    );
    if (stats.closed.length)
      console.log("[ctrader-sync] closed:", JSON.stringify(stats.closed));
    if (stats.review.length)
      console.log("[ctrader-sync] needs review:", JSON.stringify(stats.review));
    if (stats.failedLogins.length)
      console.log("[ctrader-sync] errors:", JSON.stringify(stats.failedLogins));

    return stats;
  } catch (err) {
    syncLog("run_crashed", { error: err?.message, stack: err?.stack });
    return null;
  } finally {
    running = false;
  }
}

// موقع بالا آمدن سرور ثبت می‌شود تا معلوم باشد کرون لود شده و در چه حالتی است
syncLog("cron_loaded", {
  schedule: "0 0 * * * Asia/Tehran",
  apply: process.env.CTRADER_SYNC_APPLY === "true",
});

cron.schedule("0 0 * * *", () => runNightlySync(), {
  timezone: "Asia/Tehran",
});

module.exports = runNightlySync;
