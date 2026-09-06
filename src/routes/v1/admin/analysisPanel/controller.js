const Controllers = require("../../../controllers");
const sequelize = require("../../../../../db");
const { QueryTypes } = require("sequelize");
const getRange = require("../../../../utils/getRange");
const { Op, fn, col, literal } = require("sequelize");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const Order = require("../../../../models/Order");
const Setting = require("../../../../models/Setting");

// ============================================================
// helpers
// ============================================================

// سفارش‌هایی که واقعاً بابت خرید چالش پرداخت شده‌اند
const PAID_ORDER_SQL = `
  o.status = 'paid'
  AND o.type IN ('challenge_purchase','challenge_purchase_wallet')
`;

const q = (sql, replacements = {}) =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * LIMIT با replacement فقط وقتی امن است که مقدار واقعاً عدد باشد؛
 * NaN یا رشته باعث خطای سینتکس SQL می‌شود.
 */
const safeLimit = (value, fallback = 10, max = 100) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
};

const pct = (part, whole) =>
  whole > 0 ? Number(((num(part) / num(whole)) * 100).toFixed(1)) : 0;

/** درصد رشد بین دو مقدار */
const growthOf = (current, previous) => {
  const c = num(current);
  const p = num(previous);
  if (p <= 0) return c > 0 ? 100 : 0;
  return Number((((c - p) / p) * 100).toFixed(1));
};

/** ریال ← تومان */
const toToman = (irr) => Math.round(num(irr) / 10);

/** نرخ دلار فعلی (تومان) */
async function getDollarPrice() {
  const setting = await Setting.findByPk(1);
  return num(setting?.dollar_price) + num(setting?.bonus_dollar);
}

/**
 * مبلغ را در هر سه واحد برمی‌گرداند.
 * مبنا ستون‌های ریالیِ سفارش است؛ اگر خالی بود از دلار × نرخ روز ساخته می‌شود.
 */
function money(usd, irr, dollarPrice) {
  const usdValue = num(usd);
  const irrValue = num(irr) || Math.round(usdValue * dollarPrice * 10);

  return {
    usd: Number(usdValue.toFixed(2)),
    irr: irrValue,
    toman: toToman(irrValue),
  };
}

const Controller = class extends Controllers {
  // ==========================================================
  // ۱) نرخ کاربران جدید — نمودار خطی
  // ==========================================================
  async newUsersChart(req, res) {
    const { range = "1m" } = req.query;

    const { startDate, endDate, prevStartDate, prevEndDate, format } =
      getRange(range);

    const rows = await q(
      `
        SELECT
            DATE_FORMAT(createdAt,:format) as label,
            COUNT(id) as total
        FROM Users
        WHERE createdAt BETWEEN :startDate AND :endDate
        GROUP BY label
        ORDER BY label ASC
      `,
      { startDate, endDate, format },
    );

    const [prev] = await q(
      `SELECT COUNT(id) as total FROM Users
       WHERE createdAt BETWEEN :prevStartDate AND :prevEndDate`,
      { prevStartDate, prevEndDate },
    );

    const labels = rows.map((i) => i.label);
    const data = rows.map((i) => num(i.total));
    const total = data.reduce((a, b) => a + b, 0);

    return this.response({
      res,
      status: 200,
      data: {
        labels,
        datasets: [{ label: "کاربران جدید", data }],
        total,
        growth: growthOf(total, prev?.total),
      },
    });
  }

  // ==========================================================
  // ۲) فروش بر اساس نوع چالش
  // ==========================================================
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
                paid_at: { [Op.between]: [startDate, endDate] },
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
        metric === "amount" ? num(item.total_amount) : num(item.total_count),
      );
    });

    return this.response({
      res,
      status: 200,
      data: {
        labels,
        datasets: [
          { label: metric === "amount" ? "مبلغ فروش" : "تعداد فروش", data },
        ],
      },
    });
  }

  // ==========================================================
  // ۳) نرخ خرید هر چالش — چند درصد از چالش‌های ساخته‌شده پرداخت شدند
  // ==========================================================
  async challengePurchaseRate(req, res) {
    const { range = "1m" } = req.query;
    const { startDate, endDate } = getRange(range);

    const rows = await q(
      `
      SELECT
        p.id,
        CONCAT_WS(' ', NULLIF(TRIM(t.name), ''), NULLIF(TRIM(p.title), '')) AS title,
        p.balance,
        COUNT(DISTINCT uc.id) AS created_count,
        COUNT(DISTINCT CASE
          WHEN paid.user_challenge_id IS NOT NULL
          THEN uc.id
        END) AS paid_count
      FROM challengeplans p

      LEFT JOIN challengetypes t
        ON t.id = p.challenge_type_id

      LEFT JOIN user_challenges uc
        ON uc.challenge_plan_id = p.id
       AND uc.createdAt BETWEEN :startDate AND :endDate

      LEFT JOIN (
        SELECT DISTINCT o.user_challenge_id
        FROM orders o
        WHERE ${PAID_ORDER_SQL}
      ) paid
        ON paid.user_challenge_id = uc.id

      GROUP BY
        p.id,
        t.name,
        p.title,
        p.balance

      HAVING created_count > 0

      ORDER BY
        (paid_count / NULLIF(created_count, 0)) DESC
    `,
      { startDate, endDate },
    );

    const items = rows.map((r) => ({
      challenge_plan_id: r.id,
      title: r.title,
      balance: num(r.balance),
      created_count: num(r.created_count),
      paid_count: num(r.paid_count),
      rate: pct(r.paid_count, r.created_count),
    }));

    const best = items[0] || null;

    return this.response({
      res,
      status: 200,
      data: {
        labels: items.map((i) => i.title),
        datasets: [
          {
            label: "نرخ خرید",
            data: items.map((i) => i.rate),
          },
        ],
        items,
        best_rate: best?.rate ?? 0,
        best_title: best?.title ?? null,
      },
    });
  }

  // ==========================================================
  // ۴) بهترین چالش — بالاترین نرخ خرید همراه با فروش و درآمد
  // ==========================================================
  async bestChallenge(req, res) {
    const { range = "1m" } = req.query;
    const { startDate, endDate } = getRange(range);
    const dollarPrice = await getDollarPrice();

    const rows = await q(
      `
      SELECT
        p.id,
        CONCAT_WS(' ', NULLIF(TRIM(t.name), ''), NULLIF(TRIM(p.title), '')) AS title,
        p.balance,
        COUNT(DISTINCT uc.id) AS created_count,
        COUNT(DISTINCT o.user_challenge_id) AS paid_count,
        COALESCE(SUM(o.final_amount_usd), 0) AS revenue_usd,
        COALESCE(SUM(o.final_amount_irr), 0) AS revenue_irr

      FROM challengeplans p

      LEFT JOIN challengetypes t
        ON t.id = p.challenge_type_id

      LEFT JOIN user_challenges uc
        ON uc.challenge_plan_id = p.id
       AND uc.createdAt BETWEEN :startDate AND :endDate

      LEFT JOIN orders o
        ON o.user_challenge_id = uc.id
       AND ${PAID_ORDER_SQL}

      GROUP BY
        p.id,
        t.name,
        p.title,
        p.balance

      HAVING created_count > 0

      ORDER BY
        (paid_count / NULLIF(created_count, 0)) DESC,
        revenue_usd DESC

      LIMIT 1
    `,
      { startDate, endDate },
    );

    const best = rows[0];

    if (!best) {
      return this.response({
        res,
        status: 200,
        data: null,
      });
    }

    return this.response({
      res,
      status: 200,
      data: {
        challenge_plan_id: best.id,
        title: best.title,
        balance: num(best.balance),
        purchase_rate: pct(best.paid_count, best.created_count),
        sales_count: num(best.paid_count),
        revenue: money(best.revenue_usd, best.revenue_irr, dollarPrice),
      },
    });
  }

  // ==========================================================
  // ۵) نرخ تبدیل کاربران — ثبت‌نام ← خرید
  // ==========================================================
  async userConversion(req, res) {
    const { range = "1m" } = req.query;
    const { startDate, endDate } = getRange(range);

    const [signups] = await q(
      `SELECT COUNT(id) AS total FROM Users
       WHERE createdAt BETWEEN :startDate AND :endDate`,
      { startDate, endDate },
    );

    const [buyers] = await q(
      `
        SELECT COUNT(DISTINCT u.id) AS total
        FROM Users u
        JOIN orders o ON o.user_id = u.id AND ${PAID_ORDER_SQL}
        WHERE u.createdAt BETWEEN :startDate AND :endDate
      `,
      { startDate, endDate },
    );

    return this.response({
      res,
      status: 200,
      data: {
        signup_count: num(signups?.total),
        buy_count: num(buyers?.total),
        conversion_rate: pct(buyers?.total, signups?.total),
      },
    });
  }

  // ==========================================================
  // ۶) درآمد هر چالش
  // ==========================================================
  async challengeRevenue(req, res) {
    const { range = "1m", group_by = "plan" } = req.query;
    const { startDate, endDate } = getRange(range);
    const dollarPrice = await getDollarPrice();

    const byType = group_by === "type";

    const rows = await q(
      `
      SELECT
        ${
          byType
            ? `
              t.id AS id,
              t.name AS title
            `
            : `
              p.id AS id,
              CONCAT_WS(
                ' ',
                NULLIF(TRIM(t.name), ''),
                NULLIF(TRIM(p.title), '')
              ) AS title
            `
        },

        COALESCE(SUM(o.final_amount_usd), 0) AS revenue_usd,
        COALESCE(SUM(o.final_amount_irr), 0) AS revenue_irr,
        COUNT(DISTINCT o.id) AS orders_count

      FROM orders o

      JOIN user_challenges uc
        ON uc.id = o.user_challenge_id

      JOIN challengeplans p
        ON p.id = uc.challenge_plan_id

      JOIN challengetypes t
        ON t.id = p.challenge_type_id

      WHERE ${PAID_ORDER_SQL}
        AND o.paid_at BETWEEN :startDate AND :endDate

      ${
        byType
          ? `
            GROUP BY
              t.id,
              t.name
          `
          : `
            GROUP BY
              p.id,
              t.name,
              p.title
          `
      }

      ORDER BY revenue_usd DESC
    `,
      { startDate, endDate },
    );

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      orders_count: num(r.orders_count),
      revenue: money(r.revenue_usd, r.revenue_irr, dollarPrice),
    }));

    const totalUsd = items.reduce((a, i) => a + i.revenue.usd, 0);

    const totalIrr = items.reduce((a, i) => a + i.revenue.irr, 0);

    return this.response({
      res,
      status: 200,
      data: {
        labels: items.map((i) => i.title),

        datasets: [
          {
            label: "درآمد (تومان)",
            data: items.map((i) => i.revenue.toman),
          },
        ],

        items,

        total: money(totalUsd, totalIrr, dollarPrice),
      },
    });
  }

  // ==========================================================
  // ۷) دلایل رد شدن چالش
  // ==========================================================
  async rejectionReasons(req, res) {
    const { range = "1m" } = req.query;
    const { startDate, endDate } = getRange(range);

    const rows = await q(
      `
        SELECT
          r.id,
          r.title,
          COUNT(ri.id) AS total
        FROM challenge_rejection_items ri
        JOIN challenge_rejections cr ON cr.id = ri.challenge_rejection_id
        JOIN challenge_reject_reasons r ON r.id = ri.reason_id
        WHERE cr.createdAt BETWEEN :startDate AND :endDate
        GROUP BY r.id, r.title
        ORDER BY total DESC
      `,
      { startDate, endDate },
    );

    const total = rows.reduce((a, r) => a + num(r.total), 0);

    const items = rows.map((r) => ({
      reason_id: r.id,
      title: r.title,
      count: num(r.total),
      percent: pct(r.total, total),
    }));

    return this.response({
      res,
      status: 200,
      data: {
        labels: items.map((i) => i.title),
        datasets: [{ label: "دلایل رد", data: items.map((i) => i.count) }],
        items,
        total,
      },
    });
  }

  // ==========================================================
  // ۸) نرخ رسیدن به ریل — کاربرانی که به مرحله ریل رسیده‌اند
  // ==========================================================
  async realReachRate(req, res) {
    const { range = "1y" } = req.query;
    const { startDate, endDate, format } = getRange(range);

    const rows = await q(
      `
        SELECT
          DATE_FORMAT(uc.updatedAt,:format) AS label,
          COUNT(DISTINCT uc.id) AS total
        FROM user_challenges uc
        WHERE uc.status = 'real'
          AND uc.updatedAt BETWEEN :startDate AND :endDate
        GROUP BY label
        ORDER BY label ASC
      `,
      { startDate, endDate, format },
    );

    const [totalRow] = await q(
      `SELECT COUNT(DISTINCT uc.user_id) AS total
       FROM user_challenges uc WHERE uc.status = 'real'`,
    );

    const [startedRow] = await q(
      `SELECT COUNT(DISTINCT uc.id) AS total
       FROM user_challenges uc
       WHERE uc.status IN ('phase1','phase2','real','closed')
         AND uc.createdAt BETWEEN :startDate AND :endDate`,
      { startDate, endDate },
    );

    const data = rows.map((r) => num(r.total));

    // نمودار تجمعی، چون «رسیدن به ریل» یک شمارنده‌ی رو به رشد است
    let running = 0;
    const cumulative = data.map((v) => (running += v));

    return this.response({
      res,
      status: 200,
      data: {
        labels: rows.map((r) => r.label),
        datasets: [{ label: "رسیدن به ریل", data: cumulative }],
        total_users: num(totalRow?.total),
        started_count: num(startedRow?.total),
        rate: pct(
          data.reduce((a, b) => a + b, 0),
          startedRow?.total,
        ),
      },
    });
  }

  // ==========================================================
  // ۹) تیکت‌های جدید
  // ==========================================================
  async newTickets(req, res) {
    const { range = "1y" } = req.query;
    const { startDate, endDate, prevStartDate, prevEndDate, format } =
      getRange(range);

    const rows = await q(
      `
        SELECT DATE_FORMAT(createdAt,:format) AS label, COUNT(id) AS total
        FROM Tickets
        WHERE createdAt BETWEEN :startDate AND :endDate
        GROUP BY label ORDER BY label ASC
      `,
      { startDate, endDate, format },
    );

    const [prev] = await q(
      `SELECT COUNT(id) AS total FROM Tickets
       WHERE createdAt BETWEEN :prevStartDate AND :prevEndDate`,
      { prevStartDate, prevEndDate },
    );

    const data = rows.map((r) => num(r.total));
    const total = data.reduce((a, b) => a + b, 0);

    return this.response({
      res,
      status: 200,
      data: {
        labels: rows.map((r) => r.label),
        datasets: [{ label: "تیکت جدید", data }],
        total,
        growth: growthOf(total, prev?.total),
      },
    });
  }

  // ==========================================================
  // ۱۰) وضعیت تماس‌ها — پاسخ داده شده / بدون پاسخ
  // ==========================================================
  async callsStatus(req, res) {
    const { range = "1m" } = req.query;
    const { startDate, endDate } = getRange(range);

    const [row] = await q(
      `
        SELECT
          COUNT(id) AS total,
          SUM(CASE WHEN is_answer = 1 THEN 1 ELSE 0 END) AS answered
        FROM call_history
        WHERE createdAt BETWEEN :startDate AND :endDate
      `,
      { startDate, endDate },
    );

    const total = num(row?.total);
    const answered = num(row?.answered);
    const noAnswer = total - answered;

    return this.response({
      res,
      status: 200,
      data: {
        total,
        labels: ["پاسخ داده شده", "بدون پاسخ"],
        datasets: [{ label: "تماس‌ها", data: [answered, noAnswer] }],
        answered_count: answered,
        answered_percent: pct(answered, total),
        no_answer_count: noAnswer,
        no_answer_percent: pct(noAnswer, total),
      },
    });
  }

  // ==========================================================
  // ۱۱) عملکرد فروشنده‌ها
  // ==========================================================
  async sellersPerformance(req, res) {
    const { range = "1m", limit = 10 } = req.query;
    const { startDate, endDate } = getRange(range);

    const rows = await q(
      `
        SELECT
          a.id,
          a.name,
          a.avatar,
          COUNT(DISTINCT c.id) AS calls_count,
          COUNT(DISTINCT CASE WHEN c.is_answer = 1 THEN c.id END) AS answered_count,
          COUNT(DISTINCT CASE WHEN paid.user_id IS NOT NULL
                              THEN c.user_id END) AS converted_count,
          COUNT(DISTINCT c.user_id) AS reached_users
        FROM Admins a
        JOIN call_history c
          ON c.admin_id = a.id
         AND c.createdAt BETWEEN :startDate AND :endDate
        LEFT JOIN (
          SELECT DISTINCT o.user_id
          FROM orders o
          WHERE ${PAID_ORDER_SQL}
            AND o.paid_at BETWEEN :startDate AND :endDate
        ) paid ON paid.user_id = c.user_id
        GROUP BY a.id, a.name, a.avatar
        ORDER BY calls_count DESC
        LIMIT :limit
      `,
      { startDate, endDate, limit: safeLimit(limit) },
    );

    const items = rows.map((r) => ({
      admin_id: r.id,
      name: r.name,
      avatar: r.avatar,
      calls_count: num(r.calls_count),
      answered_count: num(r.answered_count),
      reached_users: num(r.reached_users),
      converted_count: num(r.converted_count),
      conversion_rate: pct(r.converted_count, r.reached_users),
    }));

    return this.response({ res, status: 200, data: items });
  }

  // ==========================================================
  // ۱۲) بهترین چالش‌ها — رتبه‌بندی بر اساس درآمد و نرخ خرید
  // ==========================================================
  async bestChallenges(req, res) {
    const { range = "1m", limit = 5 } = req.query;
    const { startDate, endDate } = getRange(range);
    const dollarPrice = await getDollarPrice();

    const rows = await q(
      `
      SELECT
        p.id,
        CONCAT_WS(
          ' ',
          NULLIF(TRIM(t.name), ''),
          NULLIF(TRIM(p.title), '')
        ) AS title,
        p.balance,

        COUNT(DISTINCT uc.id) AS created_count,

        COUNT(DISTINCT o.user_challenge_id) AS paid_count,

        COALESCE(SUM(o.final_amount_usd), 0) AS revenue_usd,

        COALESCE(SUM(o.final_amount_irr), 0) AS revenue_irr

      FROM challengeplans p

      LEFT JOIN challengetypes t
        ON t.id = p.challenge_type_id

      LEFT JOIN user_challenges uc
        ON uc.challenge_plan_id = p.id
       AND uc.createdAt BETWEEN :startDate AND :endDate

      LEFT JOIN orders o
        ON o.user_challenge_id = uc.id
       AND ${PAID_ORDER_SQL}

      GROUP BY
        p.id,
        t.name,
        p.title,
        p.balance

      HAVING created_count > 0

      ORDER BY revenue_usd DESC

      LIMIT :limit
    `,
      {
        startDate,
        endDate,
        limit: safeLimit(limit),
      },
    );

    const items = rows.map((r, index) => ({
      rank: index + 1,

      challenge_plan_id: r.id,

      title: r.title,

      balance: num(r.balance),

      success_purchase_count: num(r.paid_count),

      purchase_rate: pct(r.paid_count, r.created_count),

      revenue: money(r.revenue_usd, r.revenue_irr, dollarPrice),
    }));

    return this.response({
      res,
      status: 200,
      data: items,
    });
  }
  // ==========================================================
  // ۱۳) عملکرد پشتیبان‌ها — تیکت‌های بسته / در انتظار / باز
  // ==========================================================
  async supportersPerformance(req, res) {
    const { range = "1m", limit = 10 } = req.query;
    const { startDate, endDate } = getRange(range);

    const rows = await q(
      `
        SELECT
          a.id,
          a.name,
          a.avatar,
          COUNT(t.id) AS total,
          SUM(CASE WHEN t.status IN ('ticket_closed','kyc_closed','widthdraw_payed')
                   THEN 1 ELSE 0 END) AS closed_count,
          SUM(CASE WHEN t.status IN ('ticket_in_review','ticket_waiting_payout',
                                     'ticket_waiting_interview','kvc_pending',
                                     'widthdraw_requsted')
                   THEN 1 ELSE 0 END) AS waiting_count,
          SUM(CASE WHEN t.status IN ('ticket_open','ticket_answered')
                   THEN 1 ELSE 0 END) AS open_count
        FROM Admins a
        JOIN Tickets t
          ON t.admin_id = a.id
         AND t.createdAt BETWEEN :startDate AND :endDate
        GROUP BY a.id, a.name, a.avatar
        ORDER BY total DESC
        LIMIT :limit
      `,
      { startDate, endDate, limit: safeLimit(limit) },
    );

    const items = rows.map((r) => ({
      admin_id: r.id,
      name: r.name,
      avatar: r.avatar,
      total_tickets: num(r.total),
      closed_count: num(r.closed_count),
      waiting_count: num(r.waiting_count),
      open_count: num(r.open_count),
      close_rate: pct(r.closed_count, r.total),
    }));

    return this.response({ res, status: 200, data: items });
  }

  // ==========================================================
  // ۱۴) روند درآمد
  // ==========================================================
  async revenueTrend(req, res) {
    const { range = "6m" } = req.query;
    const { startDate, endDate, prevStartDate, prevEndDate, format } =
      getRange(range);
    const dollarPrice = await getDollarPrice();

    const rows = await q(
      `
        SELECT
          DATE_FORMAT(o.paid_at,:format) AS label,
          COALESCE(SUM(o.final_amount_usd),0) AS revenue_usd,
          COALESCE(SUM(o.final_amount_irr),0) AS revenue_irr
        FROM orders o
        WHERE ${PAID_ORDER_SQL}
          AND o.paid_at BETWEEN :startDate AND :endDate
        GROUP BY label ORDER BY label ASC
      `,
      { startDate, endDate, format },
    );

    const [prev] = await q(
      `
        SELECT COALESCE(SUM(o.final_amount_irr),0) AS revenue_irr
        FROM orders o
        WHERE ${PAID_ORDER_SQL}
          AND o.paid_at BETWEEN :prevStartDate AND :prevEndDate
      `,
      { prevStartDate, prevEndDate },
    );

    const points = rows.map((r) =>
      money(r.revenue_usd, r.revenue_irr, dollarPrice),
    );

    const totalIrr = points.reduce((a, p) => a + p.irr, 0);
    const totalUsd = points.reduce((a, p) => a + p.usd, 0);

    const best = points.reduce((a, p) => (p.irr > a ? p.irr : a), 0);
    const average = points.length ? Math.round(totalIrr / points.length) : 0;

    return this.response({
      res,
      status: 200,
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          { label: "درآمد (تومان)", data: points.map((p) => p.toman) },
        ],
        total: money(totalUsd, totalIrr, dollarPrice),
        best_month_toman: toToman(best),
        average_toman: toToman(average),
        growth: growthOf(totalIrr, prev?.revenue_irr),
      },
    });
  }

  // ==========================================================
  // ۱۵) هدف فروش ماه
  //
  // هدف در دیتابیس ذخیره نمی‌شود (جدول setting فقط نرخ دلار دارد).
  // اولویت: query ?target_toman=  →  متغیر محیطی MONTHLY_SALES_TARGET_TOMAN
  // ==========================================================
  async salesTarget(req, res) {
    const { startDate, endDate } = getRange("this_month");
    const dollarPrice = await getDollarPrice();

    const targetToman = num(
      req.query.target_toman || process.env.MONTHLY_SALES_TARGET_TOMAN || 0,
    );

    const [row] = await q(
      `
        SELECT
          COALESCE(SUM(o.final_amount_usd),0) AS revenue_usd,
          COALESCE(SUM(o.final_amount_irr),0) AS revenue_irr
        FROM orders o
        WHERE ${PAID_ORDER_SQL}
          AND o.paid_at BETWEEN :startDate AND :endDate
      `,
      { startDate, endDate },
    );

    const current = money(row?.revenue_usd, row?.revenue_irr, dollarPrice);

    return this.response({
      res,
      status: 200,
      data: {
        current_toman: current.toman,
        current_usd: current.usd,
        target_toman: targetToman,
        remaining_toman: Math.max(targetToman - current.toman, 0),
        progress_percent: pct(current.toman, targetToman),
        is_target_configured: targetToman > 0,
      },
    });
  }

  // ==========================================================
  // ۱۶) ساعات پرترافیک تماس
  // ==========================================================
  async peakHours(req, res) {
    const { range = "1m", limit = 6 } = req.query;
    const { startDate, endDate } = getRange(range);

    const rows = await q(
      `
        SELECT HOUR(createdAt) AS hour, COUNT(id) AS total
        FROM call_history
        WHERE createdAt BETWEEN :startDate AND :endDate
        GROUP BY hour
        ORDER BY total DESC
        LIMIT :limit
      `,
      { startDate, endDate, limit: safeLimit(limit) },
    );

    const items = rows.map((r) => ({
      hour: num(r.hour),
      label: `${String(num(r.hour)).padStart(2, "0")}:00`,
      count: num(r.total),
    }));

    const max = items.reduce((a, i) => (i.count > a ? i.count : a), 0);

    return this.response({
      res,
      status: 200,
      data: {
        labels: items.map((i) => i.label),
        datasets: [{ label: "تعداد تماس", data: items.map((i) => i.count) }],
        items: items.map((i) => ({ ...i, percent: pct(i.count, max) })),
        peak_hour: items[0]?.label ?? null,
      },
    });
  }

  // ==========================================================
  // ۱۷) وضعیت چالش‌ها
  // ==========================================================
  async challengesStatus(req, res) {
    const { range = "1m" } = req.query;
    const { startDate, endDate } = getRange(range);

    const rows = await q(
      `
      SELECT
        status,
        COUNT(id) AS total
      FROM user_challenges
      WHERE createdAt BETWEEN :startDate AND :endDate
      GROUP BY status
      ORDER BY total DESC
    `,
      { startDate, endDate },
    );

    const total = rows.reduce((sum, row) => sum + num(row.total), 0);

    const items = rows.map((row) => ({
      key: row.status,
      title: row.status,
      count: num(row.total),
      percent: pct(row.total, total),
    }));

    return this.response({
      res,
      status: 200,
      data: {
        total,

        labels: items.map((item) => item.title),

        datasets: [
          {
            label: "چالش‌ها",
            data: items.map((item) => item.count),
          },
        ],

        items,
      },
    });
  }

  // ==========================================================
  // ۱۸) قیف فروش
  // ==========================================================
  async salesFunnel(req, res) {
    const { range = "1m" } = req.query;
    const { startDate, endDate } = getRange(range);

    const [signup] = await q(
      `SELECT COUNT(id) AS total FROM Users
       WHERE createdAt BETWEEN :startDate AND :endDate`,
      { startDate, endDate },
    );

    const [contacted] = await q(
      `
        SELECT COUNT(DISTINCT c.user_id) AS total
        FROM call_history c
        JOIN Users u ON u.id = c.user_id
        WHERE u.createdAt BETWEEN :startDate AND :endDate
      `,
      { startDate, endDate },
    );

    const [started] = await q(
      `
        SELECT COUNT(DISTINCT uc.user_id) AS total
        FROM user_challenges uc
        JOIN Users u ON u.id = uc.user_id
        WHERE u.createdAt BETWEEN :startDate AND :endDate
          AND uc.status IN ('phase1','phase2','real','closed')
      `,
      { startDate, endDate },
    );

    const [completed] = await q(
      `
        SELECT COUNT(DISTINCT uc.user_id) AS total
        FROM user_challenges uc
        JOIN Users u ON u.id = uc.user_id
        WHERE u.createdAt BETWEEN :startDate AND :endDate
          AND uc.status = 'real'
      `,
      { startDate, endDate },
    );

    const [purchased] = await q(
      `
        SELECT COUNT(DISTINCT o.user_id) AS total
        FROM orders o
        JOIN Users u ON u.id = o.user_id
        WHERE u.createdAt BETWEEN :startDate AND :endDate
          AND ${PAID_ORDER_SQL}
      `,
      { startDate, endDate },
    );

    const base = num(signup?.total);

    const steps = [
      { key: "signup", title: "ثبت‌نام", count: base },
      { key: "contacted", title: "تماس اولیه", count: num(contacted?.total) },
      { key: "started", title: "شروع چالش", count: num(started?.total) },
      { key: "completed", title: "تکمیل چالش", count: num(completed?.total) },
      { key: "purchased", title: "خرید نهایی", count: num(purchased?.total) },
    ].map((s, i, arr) => ({
      ...s,
      percent: pct(s.count, base),
      // چند درصد از مرحله‌ی قبل به این مرحله رسیده‌اند
      step_percent: i === 0 ? 100 : pct(s.count, arr[i - 1].count),
    }));

    const finalStep = steps[steps.length - 1];

    return this.response({
      res,
      status: 200,
      data: {
        steps,
        final_conversion_rate: finalStep.percent,
        drop_off_rate: Number((100 - finalStep.percent).toFixed(1)),
      },
    });
  }
};

module.exports = new Controller();
