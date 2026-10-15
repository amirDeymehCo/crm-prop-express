const fs = require("fs");
const path = require("path");

/**
 * لاگ اختصاصی همگام‌سازی cTrader در logs/ctrader-sync.log
 * هر خط یک JSON است تا با grep / jq راحت خوانده شود.
 */
const logsDir = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(logsDir, "ctrader-sync.log");

function syncLog(event, data = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), event, ...data });

  console.log(`[ctrader-sync] ${line}`);

  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (err) {
    console.error("[ctrader-sync] cannot write log file:", err.message);
  }
}

module.exports = { syncLog, LOG_FILE };
