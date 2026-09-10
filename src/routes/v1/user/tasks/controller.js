const Controllers = require("../../../controllers");
const TaskDefinition = require("../../../../models/Task/TaskDefinition");
const TaskSubmission = require("../../../../models/Task/TaskSubmission");
const PayoutRequest = require("../../../../models/Challenge/PayoutRequest");
const Coupon = require("../../../../models/Coupon");
const PointsRedemption = require("../../../../models/Task/PointsRedemption");
const User = require("../../../../models/User");
const sequelize = require("../../../../../db");
const { randomBytes } = require("crypto");
const {
  getUserPointsStatus,
  getTiers,
  getUserPoints,
} = require("../../../../services/TaskPoints");

/** اعتبار کد تخفیف تولیدشده (روز) */
const COUPON_VALID_DAYS = Number(process.env.TASK_COUPON_VALID_DAYS || 30);

/** ساخت کد یکتا؛ در صورت برخورد چند بار تلاش می‌کند */
async function generateUniqueCode(userId, transaction) {
  for (let i = 0; i < 6; i++) {
    const code = `MP${userId}${randomBytes(3).toString("hex").toUpperCase()}`;

    const exists = await Coupon.findOne({
      where: { code },
      attributes: ["id"],
      transaction,
    });

    if (!exists) return code;
  }

  throw Object.assign(new Error("ساخت کد یکتا ناموفق بود، دوباره تلاش کنید"), {
    status: 500,
  });
}

/** آیا کاربر حداقل یک برداشت سودِ پرداخت‌شده دارد؟ */
async function hasPaidPayout(userId) {
  const count = await PayoutRequest.count({
    where: { user_id: userId, status: "paid" },
  });

  return count > 0;
}

const CATEGORY_TITLE = {
  social: "شبکه‌های اجتماعی",
  content: "مشارکت در محتوا",
  certificate: "اشتراک‌گذاری سرتیفیکیت",
  other: "سایر",
};

const Controller = class extends Controllers {
  /**
   * صفحه‌ی «تسک‌ها و امتیازها»:
   * امتیاز و تخفیف کاربر + همه‌ی تسک‌های فعال با وضعیت خود کاربر
   */
  async list(req, res) {
    const userId = req.user.id;

    const [status, tasks, submissions, userHasPayout] = await Promise.all([
      getUserPointsStatus(userId),
      TaskDefinition.findAll({
        where: { is_active: true },
        order: [
          ["sort_order", "ASC"],
          ["id", "ASC"],
        ],
      }),
      TaskSubmission.findAll({
        where: { user_id: userId },
        order: [["id", "DESC"]],
      }),
      hasPaidPayout(userId),
    ]);

    const byTask = new Map();
    submissions.forEach((s) => {
      const list = byTask.get(s.task_definition_id) || [];
      list.push(s);
      byTask.set(s.task_definition_id, list);
    });

    const groups = new Map();

    tasks.forEach((task) => {
      const mine = byTask.get(task.id) || [];

      const approvedCount = mine.filter((s) => s.status === "approved").length;
      const pendingCount = mine.filter((s) => s.status === "pending").length;
      const last = mine[0] || null;

      // برای تسک یک‌بار‌مصرف، بعد از ثبت یا تایید دیگر قابل ارسال نیست
      const reachedMax =
        task.max_submissions != null &&
        mine.length >= Number(task.max_submissions);

      // تسک‌های سرتیفیکیت فقط برای کسی که برداشت سود داشته
      const payoutOk = task.requires_payout ? userHasPayout : true;

      const can_submit =
        payoutOk &&
        (task.is_repeatable
          ? !reachedMax
          : approvedCount === 0 && pendingCount === 0);

      const item = {
        id: task.id,
        title: task.title,
        description: task.description,
        category: task.category,
        points: Number(task.points),
        action_url: task.action_url,
        action_label: task.action_label,
        verify_type: task.verify_type,
        is_repeatable: task.is_repeatable,
        requires_proof: task.requires_proof,
        max_submissions: task.max_submissions,
        requires_payout: task.requires_payout,
        locked_reason:
          task.requires_payout && !userHasPayout
            ? "این تسک پس از دریافت اولین برداشت سود فعال می‌شود"
            : null,

        my_status: last?.status ?? "not_started",
        my_submissions_count: mine.length,
        my_approved_count: approvedCount,
        my_earned_points: mine
          .filter((s) => s.status === "approved")
          .reduce((a, s) => a + Number(s.awarded_points || 0), 0),
        can_submit,
        last_submission: last
          ? {
              id: last.id,
              status: last.status,
              admin_note: last.admin_note,
              createdAt: last.createdAt,
              reviewed_at: last.reviewed_at,
            }
          : null,
      };

      const group = groups.get(task.category) || {
        key: task.category,
        title: CATEGORY_TITLE[task.category] || task.category,
        tasks: [],
      };

      group.tasks.push(item);
      groups.set(task.category, group);
    });

    return this.response({
      res,
      status: 200,
      data: {
        points: status.points,
        current_discount_percent: status.current_discount_percent,
        next_tier: status.next_tier,
        tiers: status.tiers,
        groups: [...groups.values()],
      },
    });
  }

  /** فقط کارت بالای صفحه (امتیاز و تخفیف) */
  async myPoints(req, res) {
    const status = await getUserPointsStatus(req.user.id);
    return this.response({ res, status: 200, data: status });
  }

  /** ثبت انجام تسک به همراه مدرک */
  async submit(req, res) {
    const userId = req.user.id;
    const { task_id, note = null } = req.body;

    const task = await TaskDefinition.findOne({
      where: { id: task_id, is_active: true },
    });

    if (!task) {
      return this.response({
        res,
        status: 404,
        message: "تسک مورد نظر یافت نشد یا غیرفعال است",
      });
    }

    if (task.requires_payout && !(await hasPaidPayout(userId))) {
      return this.response({
        res,
        status: 400,
        message: "این تسک پس از دریافت اولین برداشت سود فعال می‌شود",
      });
    }

    const files = (req.files || []).map((f) => f.path || f.filename);

    if (task.requires_proof && !files.length && !note) {
      return this.response({
        res,
        status: 400,
        message: "برای این تسک ارسال مدرک یا توضیح الزامی است",
      });
    }

    const mine = await TaskSubmission.findAll({
      where: { user_id: userId, task_definition_id: task.id },
      attributes: ["id", "status"],
    });

    if (!task.is_repeatable) {
      const blocking = mine.find((s) =>
        ["pending", "approved"].includes(s.status),
      );

      if (blocking) {
        return this.response({
          res,
          status: 400,
          message:
            blocking.status === "approved"
              ? "این تسک قبلاً برای شما تایید شده است"
              : "ثبت قبلی شما برای این تسک در حال بررسی است",
        });
      }
    } else if (
      task.max_submissions != null &&
      mine.length >= Number(task.max_submissions)
    ) {
      return this.response({
        res,
        status: 400,
        message: "سقف دفعات مجاز برای این تسک تکمیل شده است",
      });
    }

    const submission = await TaskSubmission.create({
      user_id: userId,
      task_definition_id: task.id,
      status: "pending",
      note,
      files: files.length ? files : null,
      awarded_points: 0,
    });

    return this.response({
      res,
      status: 201,
      message: "ثبت شد و پس از بررسی پشتیبانی امتیاز اضافه می‌شود",
      data: { id: submission.id, status: submission.status },
    });
  }

  /**
   * تبدیل امتیاز به کد تخفیف اختصاصی.
   *
   * body (اختیاری): { min_points }  ← اگر کاربر بخواهد پله‌ی پایین‌تری را
   * خرج کند. پیش‌فرض: بالاترین پله‌ای که توانش را دارد.
   *
   * امتیاز به اندازه‌ی `min_points` همان پله کم می‌شود.
   */
  async generateCoupon(req, res) {
    const userId = req.user.id;

    const t = await sequelize.transaction();

    try {
      // قفل روی ردیف کاربر تا دو درخواست همزمان نتوانند یک امتیاز را دو بار خرج کنند
      await User.findByPk(userId, {
        attributes: ["id"],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const [points, tiers] = await Promise.all([
        getUserPoints(userId, t),
        getTiers(t),
      ]);

      if (!tiers.length) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "پله‌های تخفیف هنوز تنظیم نشده‌اند",
        });
      }

      const affordable = tiers.filter((x) => points >= x.min_points);

      if (!affordable.length) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: `امتیاز شما کافی نیست. حداقل ${tiers[0].min_points} امتیاز لازم است`,
        });
      }

      // پله‌ی انتخابی کاربر یا بالاترین پله‌ی در دسترس
      const requested = req.body?.min_points;

      const tier =
        requested != null
          ? affordable.find((x) => x.min_points === Number(requested))
          : affordable[affordable.length - 1];

      if (!tier) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "پله‌ی انتخابی معتبر نیست یا امتیاز شما برای آن کافی نیست",
        });
      }

      const code = await generateUniqueCode(userId, t);

      const now = new Date();
      const validTo = new Date(
        now.getTime() + COUPON_VALID_DAYS * 24 * 60 * 60 * 1000,
      );

      const copunData = {
        title: `تخفیف ${tier.discount_percent}٪ امتیاز تسک‌ها`,
        code,
        type: "percent",
        value: tier.discount_percent,

        // اختصاصی همین کاربر و فقط یک بار
        user_id: userId,
        max_uses: 1,
        max_uses_per_user: 1,
        used_count: 0,

        valid_from: now,
        valid_to: validTo,
        is_active: true,
      };
      if (tier.discount_percent == "100") {
        copunData.challenge_type_id = 3;
      }

      const coupon = await Coupon.create(copunData, { transaction: t });

      await PointsRedemption.create(
        {
          user_id: userId,
          coupon_id: coupon.id,
          points_spent: tier.min_points,
          discount_percent: tier.discount_percent,
          coupon_code: code,
        },
        { transaction: t },
      );

      await t.commit();

      const status = await getUserPointsStatus(userId);

      return this.response({
        res,
        status: 201,
        message:
          tier.discount_percent == "0"
            ? `امتیاز شما صفر شد و کد تخفیف صد درصدی برای حساب فایتر ساخته شد`
            : `کد تخفیف ${tier.discount_percent}٪ ساخته شد و ${tier.min_points} امتیاز کسر شد`,
        data: {
          coupon: {
            id: coupon.id,
            code: coupon.code,
            discount_percent: Number(tier.discount_percent),
            valid_to: validTo,
          },
          points_spent: tier.min_points,
          points: status,
        },
      });
    } catch (err) {
      if (!t.finished) await t.rollback();
      throw err;
    }
  }

  /** کدهای تخفیفی که کاربر از امتیازش ساخته */
  async myCoupons(req, res) {
    const rows = await PointsRedemption.findAll({
      where: { user_id: req.user.id },
      include: [
        {
          model: Coupon,
          attributes: [
            "id",
            "code",
            "type",
            "value",
            "used_count",
            "max_uses",
            "valid_to",
            "is_active",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });

    const now = new Date();

    const items = rows.map((r) => {
      const c = r.Coupon;

      const isUsed = c
        ? Number(c.used_count) >= Number(c.max_uses || 1)
        : false;
      const isExpired = c?.valid_to ? new Date(c.valid_to) < now : false;

      return {
        id: r.id,
        code: r.coupon_code,
        discount_percent: Number(r.discount_percent),
        points_spent: Number(r.points_spent),
        createdAt: r.createdAt,
        valid_to: c?.valid_to ?? null,
        status: !c
          ? "revoked"
          : isUsed
            ? "used"
            : isExpired || !c.is_active
              ? "expired"
              : "active",
      };
    });

    return this.response({ res, status: 200, data: items });
  }

  /** تاریخچه‌ی ثبت‌های کاربر */
  async mySubmissions(req, res) {
    const rows = await TaskSubmission.findAll({
      where: { user_id: req.user.id },
      include: [
        {
          model: TaskDefinition,
          attributes: ["id", "title", "category", "points"],
        },
      ],
      order: [["id", "DESC"]],
    });

    return this.response({ res, status: 200, data: rows });
  }
};

module.exports = new Controller();
