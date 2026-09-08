const Controllers = require("../../../controllers");
const sequelize = require("../../../../../db");
const { Op } = require("sequelize");
const TaskDefinition = require("../../../../models/Task/TaskDefinition");
const TaskSubmission = require("../../../../models/Task/TaskSubmission");
const DiscountTier = require("../../../../models/Task/DiscountTier");
const User = require("../../../../models/User");
const Admin = require("../../../../models/Admin");
const { getUserPointsStatus } = require("../../../../services/TaskPoints");

const Controller = class extends Controllers {
  // ==========================================================
  // تعریف تسک‌ها
  // ==========================================================

  async listTasks(req, res) {
    const where = {};
    if (req.query.category) where.category = req.query.category;
    if (req.query.is_active != null)
      where.is_active = req.query.is_active === "true";

    const tasks = await TaskDefinition.findAll({
      where,
      order: [
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
    });

    return this.response({ res, status: 200, data: tasks });
  }

  async createTask(req, res) {
    const task = await TaskDefinition.create({
      title: req.body.title,
      description: req.body.description ?? null,
      category: req.body.category ?? "social",
      points: Number(req.body.points || 0),
      action_url: req.body.action_url ?? null,
      action_label: req.body.action_label ?? null,
      verify_type: req.body.verify_type ?? "manual",
      is_repeatable: Boolean(req.body.is_repeatable),
      max_submissions:
        req.body.max_submissions != null && req.body.max_submissions !== ""
          ? Number(req.body.max_submissions)
          : null,
      requires_proof:
        req.body.requires_proof != null
          ? Boolean(req.body.requires_proof)
          : true,
      sort_order: Number(req.body.sort_order || 0),
      is_active:
        req.body.is_active != null ? Boolean(req.body.is_active) : true,
    });

    return this.response({
      res,
      status: 201,
      message: "تسک با موفقیت ساخته شد",
      data: task,
    });
  }

  async updateTask(req, res) {
    const task = await TaskDefinition.findByPk(req.params.id);

    if (!task) {
      return this.response({ res, status: 404, message: "تسک یافت نشد" });
    }

    const fields = [
      "title",
      "description",
      "category",
      "points",
      "action_url",
      "action_label",
      "verify_type",
      "is_repeatable",
      "max_submissions",
      "requires_proof",
      "sort_order",
      "is_active",
    ];

    const payload = {};
    fields.forEach((f) => {
      if (req.body[f] !== undefined) payload[f] = req.body[f];
    });

    await task.update(payload);

    return this.response({
      res,
      status: 200,
      message: "تسک بروزرسانی شد",
      data: task,
    });
  }

  async deleteTask(req, res) {
    const task = await TaskDefinition.findByPk(req.params.id);

    if (!task) {
      return this.response({ res, status: 404, message: "تسک یافت نشد" });
    }

    // حذف نمی‌کنیم تا ثبت‌های قبلی و امتیازهای داده‌شده معتبر بمانند
    await task.update({ is_active: false });

    return this.response({ res, status: 200, message: "تسک غیرفعال شد" });
  }

  // ==========================================================
  // بررسی ثبت‌های کاربران
  // ==========================================================

  async listSubmissions(req, res) {
    const { status, user_id, task_id, page = 1, limit = 20 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (user_id) where.user_id = Number(user_id);
    if (task_id) where.task_definition_id = Number(task_id);

    const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const currentPage = Math.max(Number(page) || 1, 1);

    const { rows, count } = await TaskSubmission.findAndCountAll({
      where,
      include: [
        {
          model: User,
          attributes: ["id", "firstname", "lastname", "mobile", "avatar"],
        },
        {
          model: TaskDefinition,
          attributes: ["id", "title", "category", "points"],
        },
        { model: Admin, attributes: ["id", "name"] },
      ],
      order: [["id", "DESC"]],
      limit: perPage,
      offset: (currentPage - 1) * perPage,
    });

    return this.response({
      res,
      status: 200,
      data: {
        items: rows,
        total: count,
        page: currentPage,
        limit: perPage,
        pages: Math.ceil(count / perPage),
      },
    });
  }

  /** تایید ثبت و اعمال امتیاز */
  async approveSubmission(req, res) {
    const t = await sequelize.transaction();

    try {
      const submission = await TaskSubmission.findByPk(req.params.id, {
        include: [{ model: TaskDefinition }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!submission) {
        await t.rollback();
        return this.response({ res, status: 404, message: "ثبت یافت نشد" });
      }

      if (submission.status === "approved") {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "این مورد قبلاً تایید شده است",
        });
      }

      // امتیاز در لحظه‌ی تایید قفل می‌شود
      const points =
        req.body.points != null
          ? Number(req.body.points)
          : Number(submission.TaskDefinition?.points || 0);

      await submission.update(
        {
          status: "approved",
          awarded_points: points,
          admin_id: req?.admin?.id ?? null,
          admin_note: req.body.admin_note ?? null,
          reviewed_at: new Date(),
        },
        { transaction: t },
      );

      await t.commit();

      const status = await getUserPointsStatus(submission.user_id);

      return this.response({
        res,
        status: 200,
        message: `تسک تایید شد و ${points} امتیاز اضافه شد`,
        data: { submission_id: submission.id, user_points: status },
      });
    } catch (err) {
      if (!t.finished) await t.rollback();
      throw err;
    }
  }

  /** رد کردن ثبت */
  async rejectSubmission(req, res) {
    const submission = await TaskSubmission.findByPk(req.params.id);

    if (!submission) {
      return this.response({ res, status: 404, message: "ثبت یافت نشد" });
    }

    await submission.update({
      status: "rejected",
      awarded_points: 0,
      admin_id: req?.admin?.id ?? null,
      admin_note: req.body.admin_note ?? null,
      reviewed_at: new Date(),
    });

    return this.response({ res, status: 200, message: "ثبت رد شد" });
  }

  /** امتیاز و تخفیف یک کاربر */
  async userPoints(req, res) {
    const status = await getUserPointsStatus(Number(req.params.user_id));
    return this.response({ res, status: 200, data: status });
  }

  // ==========================================================
  // پله‌های تخفیف
  // ==========================================================

  async listTiers(req, res) {
    const tiers = await DiscountTier.findAll({
      order: [["min_points", "ASC"]],
    });

    return this.response({ res, status: 200, data: tiers });
  }

  /**
   * جایگزینی کامل پله‌ها با یک آرایه
   * body: { tiers: [{ min_points, discount_percent }] }
   */
  async saveTiers(req, res) {
    const list = Array.isArray(req.body.tiers) ? req.body.tiers : [];

    if (!list.length) {
      return this.response({
        res,
        status: 400,
        message: "حداقل یک پله تخفیف باید ارسال شود",
      });
    }

    const t = await sequelize.transaction();

    try {
      await DiscountTier.destroy({ where: {}, transaction: t });

      const created = await DiscountTier.bulkCreate(
        list.map((i) => ({
          min_points: Number(i.min_points),
          discount_percent: Number(i.discount_percent),
          is_active: i.is_active != null ? Boolean(i.is_active) : true,
        })),
        { transaction: t },
      );

      await t.commit();

      return this.response({
        res,
        status: 200,
        message: "پله‌های تخفیف ذخیره شد",
        data: created,
      });
    } catch (err) {
      if (!t.finished) await t.rollback();
      throw err;
    }
  }

  // ==========================================================
  // خلاصه برای داشبورد ادمین
  // ==========================================================

  async summary(req, res) {
    const [pending, approved, rejected, activeTasks] = await Promise.all([
      TaskSubmission.count({ where: { status: "pending" } }),
      TaskSubmission.count({ where: { status: "approved" } }),
      TaskSubmission.count({ where: { status: "rejected" } }),
      TaskDefinition.count({ where: { is_active: true } }),
    ]);

    const usersWithPoints = await TaskSubmission.count({
      where: { status: "approved", awarded_points: { [Op.gt]: 0 } },
      distinct: true,
      col: "user_id",
    });

    return this.response({
      res,
      status: 200,
      data: {
        pending_count: pending,
        approved_count: approved,
        rejected_count: rejected,
        active_tasks_count: activeTasks,
        users_with_points: usersWithPoints,
      },
    });
  }
};

module.exports = new Controller();
