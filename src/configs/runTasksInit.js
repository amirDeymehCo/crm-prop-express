/**
 * اجرای دستی seed تسک‌ها بدون بالا آوردن سرور:
 *
 *   node src/configs/runTasksInit.js
 *   node src/configs/runTasksInit.js --overwrite   (برگرداندن تسک‌ها به مقدار کانفیگ)
 */
const sequelize = require("../../db");
const initTasks = require("./tasksInit");

(async () => {
  try {
    await sequelize.authenticate();

    // مطمئن شو جدول‌های تسک وجود دارند
    await require("../models/Task/TaskDefinition").sync();
    await require("../models/Task/TaskSubmission").sync();
    await require("../models/Task/DiscountTier").sync();
    await require("../models/Task/PointsRedemption").sync();

    await initTasks({ overwrite: process.argv.includes("--overwrite") });

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error("[TASKS] seed failed ❌", err?.message || err);
    process.exit(1);
  }
})();
