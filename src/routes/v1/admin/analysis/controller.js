const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const founcList = require("../../../../utils/List"); // ابزار لیست فرعی خودت در صورت نیاز
const { Op } = require("sequelize");
const sequelize = require("../../../../../db");

const Controller = class extends Controllers {
  async users(req, res) {
    try {
      const monthsParam = req.query.months || 12;
      const months = Math.max(1, Math.min(36, parseInt(monthsParam, 10) || 12)); // محدود کردن بین ۱ تا ۳۶ ماه برای امنیت سرور

      const now = new Date();
      const endMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const from = new Date(
        endMonthStart.getFullYear(),
        endMonthStart.getMonth() - (months - 1),
        1,
      );
      const toExclusive = new Date(
        endMonthStart.getFullYear(),
        endMonthStart.getMonth() + 1,
        1,
      );

      const prevFrom = new Date(
        from.getFullYear(),
        from.getMonth() - months,
        1,
      );
      const prevToExclusive = from;

      const tableName = User.getTableName();

      const rows = await sequelize.query(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month_key, COUNT(*) AS count 
         FROM ${tableName} 
         WHERE createdAt >= :from AND createdAt < :toExclusive 
         GROUP BY month_key 
         ORDER BY month_key ASC`,
        {
          replacements: { from, toExclusive },
          type: sequelize.QueryTypes.SELECT,
        },
      );

      const [currentTotal, previousTotal] = await Promise.all([
        User.count({
          where: {
            createdAt: {
              [Op.gte]: from,
              [Op.lt]: toExclusive,
            },
          },
        }),
        User.count({
          where: {
            createdAt: {
              [Op.gte]: prevFrom,
              [Op.lt]: prevToExclusive,
            },
          },
        }),
      ]);

      const series = [];
      const dbMap = new Map();
      rows.forEach((r) => dbMap.set(r.month_key, parseInt(r.count, 10)));

      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(
          endMonthStart.getFullYear(),
          endMonthStart.getMonth() - i,
          1,
        );
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const monthKey = `${year}-${month}`;

        series.push({
          month: monthKey,
          count: dbMap.get(monthKey) || 0,
        });
      }

      let changePercent = null;
      if (previousTotal === 0) {
        changePercent = currentTotal === 0 ? 0 : null;
      } else {
        changePercent = parseFloat(
          (((currentTotal - previousTotal) / previousTotal) * 100).toFixed(1),
        );
      }

      const changeLabel =
        changePercent === null
          ? "NEW"
          : `${changePercent >= 0 ? "+" : ""}${changePercent}%`;

      return res.status(200).json({
        success: true,
        data: {
          months,
          range: {
            from: from.toISOString().slice(0, 10),
            to: new Date(toExclusive.getTime() - 1).toISOString().slice(0, 10),
          },
          series,
          kpis: {
            currentPeriodTotal: currentTotal,
            previousPeriodTotal: previousTotal,
            changePercent,
            changeLabel,
          },
        },
      });
    } catch (error) {
      // مدیریت خطا (اگر کلاس پدری متد هندل خطا دارد از آن استفاده کن، وگرنه رسپانس ۵۰۰ بده)
      console.error("Error in dashboard new-users API:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }
};

module.exports = new Controller();
