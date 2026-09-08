const { fn, col } = require("sequelize");
const TaskSubmission = require("../../models/Task/TaskSubmission");
const DiscountTier = require("../../models/Task/DiscountTier");

/**
 * امتیاز فعلی کاربر = مجموع امتیاز ثبت‌های تاییدشده.
 * جایی ذخیره نمی‌شود تا هیچ‌وقت با رکوردها ناهماهنگ نشود.
 */
async function getUserPoints(userId, transaction = null) {
  const row = await TaskSubmission.findOne({
    where: { user_id: userId, status: "approved" },
    attributes: [[fn("COALESCE", fn("SUM", col("awarded_points")), 0), "total"]],
    raw: true,
    transaction,
  });

  return Number(row?.total || 0);
}

/**
 * پله‌های تخفیف به ترتیب صعودی.
 */
async function getTiers(transaction = null) {
  const tiers = await DiscountTier.findAll({
    where: { is_active: true },
    order: [["min_points", "ASC"]],
    transaction,
  });

  return tiers.map((t) => ({
    id: t.id,
    min_points: Number(t.min_points),
    discount_percent: Number(t.discount_percent),
  }));
}

/**
 * وضعیت امتیاز و تخفیف کاربر: تخفیف فعلی، پله‌ی بعدی و فاصله تا آن.
 */
async function getUserPointsStatus(userId, transaction = null) {
  const [points, tiers] = await Promise.all([
    getUserPoints(userId, transaction),
    getTiers(transaction),
  ]);

  const reached = tiers.filter((t) => points >= t.min_points);
  const current = reached.length ? reached[reached.length - 1] : null;
  const next = tiers.find((t) => points < t.min_points) || null;

  return {
    points,
    current_discount_percent: current?.discount_percent ?? 0,
    next_tier: next
      ? {
          min_points: next.min_points,
          discount_percent: next.discount_percent,
          points_needed: next.min_points - points,
          progress_percent: Number(
            ((points / next.min_points) * 100).toFixed(1),
          ),
        }
      : null,
    tiers,
  };
}

module.exports = { getUserPoints, getTiers, getUserPointsStatus };
