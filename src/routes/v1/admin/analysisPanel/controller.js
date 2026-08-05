const Controllers = require("../../../controllers");
const sequelize = require("../../../../../db");
const { QueryTypes } = require("sequelize");
const getRange = require("../../../../utils/getRange");
const { Op, fn, col, literal } = require("sequelize");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const Order = require("../../../../models/Order");

const Controller = class extends Controllers {
  async newUsersChart(req, res) {
    const { range = "1m" } = req.query;

    const { startDate, endDate, format } = getRange(range);

    const rows = await sequelize.query(
      `
        SELECT
            DATE_FORMAT(createdAt,:format) as label,
            COUNT(id) as total
        FROM Users
        WHERE createdAt BETWEEN :startDate AND :endDate
        GROUP BY label
        ORDER BY label ASC
      `,
      {
        replacements: {
          startDate,
          endDate,
          format,
        },
        type: QueryTypes.SELECT,
      },
    );

    const labels = rows.map((i) => i.label);

    const data = rows.map((i) => Number(i.total));

    const total = data.reduce((a, b) => a + b, 0);

    let growth = 0;

    if (data.length > 1) {
      const first = data[0];

      const last = data[data.length - 1];

      if (first > 0) {
        growth = (((last - first) / first) * 100).toFixed(1);
      }
    }

    return this.response({
      res,
      status: 200,
      data: {
        labels,
        datasets: [
          {
            label: "کاربران جدید",
            data,
          },
        ],
        total,
        growth: Number(growth),
      },
    });
  }
  async challengeSalesChart(req, res) {
    const { range = "1m", metric = "count" } = req.query;

    const { startDate, endDate } = getRange(range);

    const challengeTypes = await ChallengeType.findAll({
      attributes: [
        "id",
        "name",
        [fn("COUNT", literal("DISTINCT `UserChallenges`.`id`")), "total_count"],
        [
          fn(
            "COALESCE",
            fn("SUM", col("UserChallenges->Orders.amount_usd")),
            0,
          ),
          "total_amount",
        ],
      ],
      include: [
        {
          model: UserChallenge,
          attributes: [],
          required: false,
          include: [
            {
              model: Order,
              attributes: [],
              required: false,
              where: {
                status: "paid",
                type: {
                  [Op.in]: ["challenge_purchase", "challenge_purchase_wallet"],
                },
                paid_at: {
                  [Op.between]: [startDate, endDate],
                },
              },
            },
          ],
        },
      ],
      group: ["ChallengeType.id"],
      order: [
        [literal(metric === "amount" ? "total_amount" : "total_count"), "DESC"],
      ],
      raw: true,
    });

    const labels = [];
    const data = [];

    challengeTypes.forEach((item) => {
      labels.push(item.name);

      data.push(
        metric === "amount"
          ? Number(item.total_amount || 0)
          : Number(item.total_count || 0),
      );
    });

    return this.response({
      res,
      status: 200,
      data: {
        labels,
        datasets: [
          {
            label: metric === "amount" ? "مبلغ فروش" : "تعداد فروش",
            data,
          },
        ],
      },
    });
  }
};

module.exports = new Controller();
