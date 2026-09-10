const { TASKS, DISCOUNT_TIERS } = require("./tasksConfig");
const TaskDefinition = require("../models/Task/TaskDefinition");
const DiscountTier = require("../models/Task/DiscountTier");

/**
 * ساخت تسک‌های پیش‌فرض و پله‌های تخفیف.
 *
 * چند بار اجرا کردنش مشکلی ندارد: تسک‌ها بر اساس `code` و پله‌ها بر اساس
 * `min_points` پیدا می‌شوند، پس رکورد تکراری ساخته نمی‌شود.
 *
 * ⚠️ تسکی که ادمین از پنل ساخته باشد اینجا دست نمی‌خورد و تسک‌هایی که از
 * لیست پیش‌فرض حذف شوند هم پاک نمی‌شوند (ممکن است کاربر رویشان امتیاز
 * گرفته باشد) — برای کنار گذاشتنشان از پنل غیرفعالشان کنید.
 */
async function initTasks({ overwrite = false } = {}) {
  console.log("[TASKS] Initializing default tasks & discount tiers...");

  /* ================== 1) Tasks ================== */
  let createdTasks = 0;
  let updatedTasks = 0;

  for (const task of TASKS) {
    const defaults = {
      code: task.code,
      title: task.title,
      description: task.description ?? null,
      category: task.category,
      points: Number(task.points || 0),
      action_url: task.action_url ?? null,
      action_label: task.action_label ?? null,
      verify_type: task.verify_type ?? "manual",
      is_repeatable: Boolean(task.is_repeatable),
      max_submissions: task.max_submissions ?? null,
      requires_proof:
        task.requires_proof != null ? Boolean(task.requires_proof) : true,
      requires_payout: Boolean(task.requires_payout),
      sort_order: Number(task.sort_order || 0),
      is_active: true,
    };

    const [row, created] = await TaskDefinition.findOrCreate({
      where: { code: task.code },
      defaults,
    });

    if (created) {
      createdTasks++;
      continue;
    }

    // به‌صورت پیش‌فرض تسک موجود دست‌نخورده می‌ماند تا تغییرات پنل پاک نشود.
    // با overwrite=true می‌شود آن را به مقدار کانفیگ برگرداند.
    if (overwrite) {
      await row.update(defaults);
      updatedTasks++;
    }
  }

  /* ================== 2) Discount tiers ================== */
  let createdTiers = 0;

  for (const tier of DISCOUNT_TIERS) {
    const [, created] = await DiscountTier.findOrCreate({
      where: { min_points: Number(tier.min_points) },
      defaults: {
        min_points: Number(tier.min_points),
        discount_percent: Number(tier.discount_percent),
        is_active: true,
      },
    });

    if (created) createdTiers++;
  }

  console.log(
    `[TASKS] Done ✅ tasks: +${createdTasks} new` +
      (overwrite ? `, ${updatedTasks} updated` : "") +
      ` | tiers: +${createdTiers} new`,
  );

  return { createdTasks, updatedTasks, createdTiers };
}

module.exports = initTasks;
