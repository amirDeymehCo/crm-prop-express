/**
 * اجرای دستی همگام‌سازی cTrader برای تست.
 *
 *   node src/crons/CTraderStatusSync/run.js                  → ۴۰ حساب اول، فقط گزارش
 *   node src/crons/CTraderStatusSync/run.js --max 200        → ۲۰۰ حساب، فقط گزارش
 *   node src/crons/CTraderStatusSync/run.js --login 1002092  → فقط یک لاگین
 *   node src/crons/CTraderStatusSync/run.js --raw 1002092    → پاسخ خام API (بدون دیتابیس)
 *   node src/crons/CTraderStatusSync/run.js --all --apply    → اجرای واقعی روی همه
 */
require("dotenv").config();

const sequelize = require("../../../db");
require("../../models/Challenge/setupAssociations")();
const {
  runCTraderStatusSync,
  fetchLoginRights,
  isClosedOnPlatform,
} = require("../../services/CTraderStatusSync");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

(async () => {
  try {
    const raw = arg("--raw");
    if (raw) {
      const rights = await fetchLoginRights(raw);
      console.log(rights);
      console.log("closedOnPlatform =", isClosedOnPlatform(rights));
      return;
    }

    await sequelize.authenticate();

    const login = arg("--login");
    const stats = await runCTraderStatusSync({
      dryRun: !args.includes("--apply"),
      logins: login ? login.split(",") : null,
      maxAccounts: args.includes("--all")
        ? Infinity
        : Number(arg("--max") || 40),
    });

    console.log(JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
