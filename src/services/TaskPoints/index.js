const { fn, col } = require("sequelize");
const TaskSubmission = require("../../models/Task/TaskSubmission");
const DiscountTier = require("../../models/Task/DiscountTier");
const PointsRedemption = require("../../models/Task/PointsRedemption");

/**
 * موجودی امتیاز کاربر = مجموع امتیاز ثبت‌های تاییدشده − امتیاز خرج‌شده.
 * هیچ ستون موجودی‌ای ذخیره نمی‌شود تا هیچ‌وقت با رکوردها ناهماهنگ نشود.
 */
async function getUserPointsBreakdown(userId, transaction = null) {
  const [earnedRow, spentRow] = await Promise.all([
    TaskSubmission.findOne({
      where: { user_id: userId, status: "approved" },
      attributes: [
        [fn("COALESCE", fn("SUM", col("awarded_points")), 0), "total"],
      ],
      raw: true,
      transaction,
    }),
    PointsRedemption.findOne({
      where: { user_id: userId },
      attributes: [
        [fn("COALESCE", fn("SUM", col("points_spent")), 0), "total"],
      ],
      raw: true,
      transaction,
    }),
  ]);

  const earned = Number(earnedRow?.total || 0);
  const spent = Number(spentRow?.total || 0);

  return { earned, spent, balance: earned - spent };
}

/** فقط موجودی قابل استفاده */
async function getUserPoints(userId, transaction = null) {
  const { balance } = await getUserPointsBreakdown(userId, transaction);
  return balance;
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
  const [breakdown, tiers] = await Promise.all([
    getUserPointsBreakdown(userId, transaction),
    getTiers(transaction),
  ]);

  const points = breakdown.balance;

  const reached = tiers.filter((t) => points >= t.min_points);
  const current = reached.length ? reached[reached.length - 1] : null;
  const next = tiers.find((t) => points < t.min_points) || null;

  return {
    points,
    earned_points: breakdown.earned,
    spent_points: breakdown.spent,
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

module.exports = {
  getUserPoints,
  getUserPointsBreakdown,
  getTiers,
  getUserPointsStatus,
};
