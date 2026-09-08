const Controllers = require("../../../controllers");
const TaskDefinition = require("../../../../models/Task/TaskDefinition");
const TaskSubmission = require("../../../../models/Task/TaskSubmission");
const { getUserPointsStatus } = require("../../../../services/TaskPoints");

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

    const [status, tasks, submissions] = await Promise.all([
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

      const can_submit = task.is_repeatable
        ? !reachedMax
        : approvedCount === 0 && pendingCount === 0;

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
