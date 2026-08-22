const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const Admin = require("../../../../models/Admin");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const Call = require("../../../../models/Call/Call");
const Note = require("../../../../models/Call/Note");
const CallRejectReason = require("../../../../models/Call/CallRejectReason");
const CallResultOption = require("../../../../models/Call/CallResultOption");
const SmsMessage = require("../../../../models/SmsMessage");
const CallReminder = require("../../../../models/Call/CallReminder");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const sequelize = require("../../../../../db");
const founcList = require("../../../../utils/List");
const { sendCustomMessage } = require("../../../../services/KavenegarService");
const { Op } = require("sequelize");

const Controller = class extends Controllers {
  async getData(req, res) {
    const { mobile } = req?.body;
    const findUser = await User.findOne({
      where: { mobile },
      attributes: {
        exclude: ["password", "refresh_token_expires_at", "refresh_token"],
      },
    });
    if (!findUser)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این شماره تلفن یافت نشد",
      });
    const userChallenge = await UserChallenge.findAll({
      where: { user_id: findUser?.id },
      attributes: { exclude: ["mt_password", "mt_server", "in_password"] },
    });

    this.response({
      res,
      status: 200,
      message: "اطلاعات مشتری",
      data: {
        userData: findUser,
        challenges: userChallenge,
      },
    });
  }
  async createCall({ body, admin }, res) {
    const t = await sequelize.transaction();

    try {
      // 1️⃣ پیدا کردن کاربر
      const findUser = await User.findOne({
        where: { id: body?.user_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!findUser) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "کاربری با این شناسه پیدا نشد",
        });
      }

      // 2️⃣ تعیین مسئول در صورت نیاز
      if (body?.responsible) {
        if (!findUser?.responsible_admin_id) {
          await User.update(
            { responsible_admin_id: admin?.id },
            { where: { id: body?.user_id }, transaction: t },
          );
        }
      }

      // 3️⃣ اعتبارسنجی دلیل رد تماس
      if (body?.direction !== "inbound")
        if (body?.is_answer === false && !body?.reject_reason_id) {
          await t.rollback();
          return this.response({
            res,
            status: 400,
            message: "باید دلیل پاسخ ندادن انتخاب شود",
          });
        }

      // 4️⃣ ساخت تماس
      const newCall = await Call.create(
        {
          ...body,
          reject_reason_id: body?.reject_reason_id || null,
          user_id: body?.user_id,
          admin_id: admin?.id,
        },
        { transaction: t },
      );

      // 5️⃣ ثبت نتایج تماس
      if (body?.is_answer === true && body?.direction !== "inbound") {
        const result_option_ids = Array.isArray(body?.result_option_ids)
          ? body.result_option_ids
          : [];

        if (result_option_ids.length === 0) {
          await t.rollback();
          return this.response({
            res,
            status: 400,
            message: "باید نتیجه تماس را انتخاب کنید",
          });
        }

        await newCall.setResults(result_option_ids, { transaction: t });
      }

      // 6️⃣ ساخت یادآور
      if (body?.reminder) {
        if (!body.reminder_at || !body.reminderDescription) {
          await t.rollback();
          return this.response({
            res,
            status: 400,
            message: "تاریخ یادآوری و توضیحات آن الزامی است",
          });
        }

        await CallReminder.create(
          {
            call_id: newCall.id,
            user_id: findUser.id,
            description: body.reminderDescription,
            remind_at: body.reminder_at,
            status: "pending",
            admin_id: admin?.id,
          },
          { transaction: t },
        );
      }

      // 7️⃣ commit نهایی
      await t.commit();

      return this.response({
        res,
        status: 200,
        message: "تماس با موفقیت ساخته شد",
      });
    } catch (error) {
      if (!t.finished) {
        await t.rollback();
      }

      return this.response({
        res,
        status: 500,
        message: error?.message || "خطا در ثبت تماس",
      });
    }
  }
  async callList(req, res) {
    const where = {};
    if (req?.query?.is_answer) where.is_answer = req.query.is_answer == "true";

    const calls = await founcList(Call, req, where, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "mobile", "firstname", "lastname", "avatar"],
          where: req?.query?.mobile
            ? { mobile: { [Op.like]: `%${req?.query?.mobile}%` } }
            : undefined,
        },
        {
          model: CallRejectReason,
          as: "reject_reason",
          attributes: ["id", "title"],
        },
        {
          model: CallResultOption,
          as: "results",
          attributes: ["id", "title", "description"],
          through: {
            attributes: [],
          },
        },
      ],
    });

    this.response({ res, data: calls, message: "لیست تماس ها" });
  }
  async sinlgeCall(req, res) {
    const find = await Call.findByPk(req?.params?.id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "mobile",
            "firstname",
            "lastname",
            "avatar",
            "kyc_steep",
            "kyc_status",
            "email",
            "createdAt",
          ],
        },
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "mobile", "name", "avatar"],
        },
        {
          model: CallRejectReason,
          as: "reject_reason",
          attributes: ["id", "title"],
        },
        {
          model: CallResultOption,
          as: "results",
          attributes: ["id", "title", "description"],
          through: {
            attributes: [],
          },
        },
      ],
    });
    if (!find)
      return this.response({
        res,
        status: 400,
        message: "شناسه تماس اشتباه است",
      });
    const nots = await Note.findAll({
      where: { call_id: find?.id },
      include: [
        {
          model: Admin,
          attributes: ["id", "mobile", "name", "avatar"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const smsMessages = await SmsMessage.findAll({
      where: { user_id: find?.user?.id },
      include: [
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "mobile", "name", "avatar"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    this.response({
      res,
      data: {
        call: find,
        nots,
        smsMessages,
      },
    });
  }
  async responsible_admin(req, res) {
    const findUser = await User.findOne({ id: req?.params?.user_id });
    if (!findUser)
      this.response({
        res,
        status: 400,
        message: "کاربری با این شناسه پیدا نشد",
      });
    if (findUser?.responsible_admin_id)
      return this.response({
        res,
        status: 400,
        message: "مدیریت این کاربر قبلا انتخاب شده است",
      });

    const setUserResponsible_admin_id = await User.update(
      { responsible_admin_id: req?.admin?.id },
      { where: { id: req?.params?.user_id } },
    );
    if (!setUserResponsible_admin_id)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این شناسه پیدا نشد",
      });

    this.response({
      res,
      status: 200,
      message: `ادمین ${req?.admin?.name} مدیریت کاربر ${findUser?.firstname + "  " + findUser?.lastname} به شما سپرده شد! `,
    });
  }
  async createSms(req, res) {
    let mobile = "";

    if (!req?.body?.mobile) {
      const findUser = await User?.findByPk(req?.body?.user_id);
      if (!findUser)
        return this.response({
          res,
          status: 400,
          message: "کاربری با این شناسه یافت نشد",
        });

      mobile = findUser?.mobile;
    }
    if (req?.body?.mobile) mobile = req?.body?.mobile;

    const sendSms = await sendCustomMessage({
      receptor: mobile,
      message: req?.body?.text,
    });
    if (!sendSms)
      return this.response({
        res,
        status: 400,
        message: "متاسفانه پیام برای کاربر ارسال نشد",
      });
    const newSms = await SmsMessage.create({
      text: req?.body?.text,
      user_id: req?.body?.user_id,
      admin_id: req?.admin?.id,
      target: req?.body?.target || null,
    });

    if (!newSms)
      this.response({ res, status: 400, message: "متاسفانه پیام ذخیره نشد" });

    this.response({ res, message: "پیام شما با موفقیت ارسال شد" });
  }
  async smsList(req, res) {
    const where = {};

    const smsMessage = await founcList(SmsMessage, req, where, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "mobile", "firstname", "lastname", "avatar"],
          where: req?.query?.mobile
            ? { mobile: { [Op.like]: `%${req?.query?.mobile}%` } }
            : undefined,
          include: [
            {
              model: Call,
              as: "calls", // چون در User.hasMany(Call, as: "calls")
              attributes: ["id", "createdAt"],
              separate: true,
              limit: 1,
            },
          ],
        },
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "mobile", "name", "avatar"],
        },
      ],
      // order: [{ model: Call, as: "calls" }, "createdAt", "DESC"],
    });

    this.response({ res, data: smsMessage, message: "لیست پیامک‌ها" });
  }

  async create_note(req, res) {
    const newNote = await Note.create({
      text: req?.body?.text,
      admin_id: req?.admin?.id,
      call_id: req?.body?.call_id,
    });

    this.response({ res, status: 201, message: "یادداشت با موفقیت ساخته شد" });
  }
  async remeinderCount(req, res) {
    try {
      const now = new Date();

      const count = await CallReminder.count({
        where: {
          admin_id: req?.admin?.id,
          status: "pending",
          remind_at: {
            [Op.lte]: now,
          },
        },
      });

      this.response({
        res,
        status: 200,
        data: { count },
      });
    } catch (error) {
      this.response({
        res,
        status: 500,
        message: "خطا در دریافت تعداد یادآوری‌ها",
      });
    }
  }
  async remeinderList(req, res) {
    try {
      const page = parseInt(req?.query?.page) || 1;
      const limit = parseInt(req?.query?.limit) || 10;
      const offset = (page - 1) * limit;

      const where = {
        admin_id: req?.admin?.id,
      };

      if (req?.query?.user_id) {
        where.user_id = req?.query?.user_id;
      }

      // گرفتن لیست با pagination
      const { rows, count: totalCount } = await CallReminder.findAndCountAll({
        where,
        include: [
          {
            model: User,
            attributes: ["id", "avatar", "mobile", "firstname", "lastname"],
          },
        ],
        limit,
        offset,
        order: [["createdAt", "DESC"]],
      });

      // گرفتن آیتم‌های pending همین صفحه
      const pendingIds = rows
        .filter((item) => item.status === "pending")
        .map((item) => item.id);

      // آپدیت فقط همون آیتم‌های pending که تو همین page بودن
      if (pendingIds.length > 0) {
        await CallReminder.update(
          { status: "done" },
          {
            where: {
              id: { [Op.in]: pendingIds },
            },
          },
        );
      }

      const resData = {
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        limit,
        items: rows,
      };

      this.response({ res, data: resData, status: 200 });
    } catch (error) {
      this.response({
        res,
        status: 500,
        message: "خطا در دریافت لیست یادآوری‌ها",
        error: error.message,
      });
    }
  }
  async userChallenges(req, res) {
    const list = await UserChallenge.findAll({
      where: { user_id: req?.params?.user_id },
      include: [
        {
          model: ChallengePlan,
          attributes: [
            "id",
            "title",
            "leverage",
            "balance",
            "challenge_type_id",
          ],
          include: [ChallengeType],
        },
      ],
    });

    this.response({ res, status: 200, data: list });
  }
  async historyCalls(req, res) {
    const callsList = await Call.findAll({
      where: { user_id: req?.params?.user_id },
      include: [
        { model: Admin, attributes: ["id", "name", "avatar"], as: "admin" },
      ],
    });

    this.response({ res, data: callsList });
  }
  async historyMessages(req, res) {
    const messagesList = await SmsMessage.findAll({
      where: { user_id: req?.params?.user_id },
      include: [
        { model: Admin, attributes: ["id", "name", "avatar"], as: "admin" },
      ],
    });

    this.response({ res, data: messagesList });
  }
  async salesplusAnalytics(req, res) {
    try {
      const { from, to, admin_id, category, direction } = req.query;

      const callWhere = {};

      // فیلتر زمانی بر اساس تاریخ واقعی تماس
      if (from || to) {
        callWhere.date_create_call = {};

        if (from) {
          callWhere.date_create_call[Op.gte] = new Date(`${from} 00:00:00`);
        }

        if (to) {
          callWhere.date_create_call[Op.lte] = new Date(`${to} 23:59:59`);
        }
      }

      if (admin_id) {
        callWhere.admin_id = admin_id;
      }

      if (category) {
        callWhere.category = category;
      }

      if (direction) {
        callWhere.direction = direction;
      }

      const smsWhere = {};

      if (from || to) {
        smsWhere.createdAt = {};

        if (from) {
          smsWhere.createdAt[Op.gte] = new Date(`${from} 00:00:00`);
        }

        if (to) {
          smsWhere.createdAt[Op.lte] = new Date(`${to} 23:59:59`);
        }
      }

      if (admin_id) {
        smsWhere.admin_id = admin_id;
      }

      const [calls, smsMessages] = await Promise.all([
        Call.findAll({
          where: callWhere,
          attributes: [
            "id",
            "user_id",
            "admin_id",
            "description",
            "is_answer",
            "how_find",
            "category",
            "time",
            "direction",
            "date_create_call",
            "reject_reason_id",
            "createdAt",
          ],
          include: [
            {
              model: Admin,
              as: "admin",
              attributes: ["id", "name", "avatar"],
              required: false,
            },
            {
              model: CallRejectReason,
              as: "reject_reason",
              attributes: ["id", "title"],
              required: false,
            },
            {
              model: CallResultOption,
              as: "results",
              attributes: ["id", "title"],
              through: {
                attributes: [],
              },
              required: false,
            },
          ],
          order: [["date_create_call", "ASC"]],
        }),

        SmsMessage.findAll({
          where: smsWhere,
          attributes: ["id", "admin_id", "user_id", "target", "createdAt"],
        }),
      ]);

      /*
    |--------------------------------------------------------------------------
    | توابع کمکی
    |--------------------------------------------------------------------------
    */

      const toNumber = (value) => {
        const number = Number(value);

        return Number.isFinite(number) ? number : 0;
      };

      const percentage = (value, total) => {
        if (!total) return 0;

        return Number(((value / total) * 100).toFixed(2));
      };

      const getAdminKey = (call) => {
        return call.admin_id ? String(call.admin_id) : "unknown";
      };

      const getAdminName = (call) => {
        if (call.admin?.name) {
          return call.admin.name;
        }

        return call.admin_id ? `Admin #${call.admin_id}` : "بدون کارشناس";
      };

      const getDateKey = (date) => {
        if (!date) return "unknown";

        const parsedDate = new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
          return "unknown";
        }

        return parsedDate.toISOString().slice(0, 10);
      };

      /*
    |--------------------------------------------------------------------------
    | شاخص‌های کلی تماس
    |--------------------------------------------------------------------------
    */

      const totalCalls = calls.length;

      const answeredCalls = calls.filter(
        (call) => call.is_answer === true || call.is_answer === 1,
      ).length;

      const unansweredCalls = totalCalls - answeredCalls;

      const inboundCalls = calls.filter(
        (call) => call.direction === "inbound",
      ).length;

      const outboundCalls = calls.filter(
        (call) => call.direction === "outbound",
      ).length;

      const totalDuration = calls.reduce((sum, call) => {
        return sum + toNumber(call.time);
      }, 0);

      const answeredDurations = calls
        .filter((call) => call.is_answer === true || call.is_answer === 1)
        .map((call) => toNumber(call.time));

      const answeredDurationTotal = answeredDurations.reduce(
        (sum, duration) => sum + duration,
        0,
      );

      const uniqueUserIds = new Set(
        calls
          .filter((call) => call.user_id)
          .map((call) => String(call.user_id)),
      );

      const totalUsers = uniqueUserIds.size;

      /*
    |--------------------------------------------------------------------------
    | عملکرد کارشناسان فروش
    |--------------------------------------------------------------------------
    */

      const adminsMap = new Map();

      for (const call of calls) {
        const key = getAdminKey(call);

        if (!adminsMap.has(key)) {
          adminsMap.set(key, {
            admin_id: call.admin_id || null,
            admin_name: getAdminName(call),
            avatar: call.admin?.avatar || null,

            total_calls: 0,
            answered_calls: 0,
            unanswered_calls: 0,

            inbound_calls: 0,
            outbound_calls: 0,

            total_duration: 0,
            answered_duration: 0,

            unique_users: new Set(),

            categories: {},
            sources: {},
            results: {},
            reject_reasons: {},
          });
        }

        const admin = adminsMap.get(key);

        admin.total_calls += 1;

        if (call.is_answer === true || call.is_answer === 1) {
          admin.answered_calls += 1;
        } else {
          admin.unanswered_calls += 1;
        }

        if (call.direction === "inbound") {
          admin.inbound_calls += 1;
        }

        if (call.direction === "outbound") {
          admin.outbound_calls += 1;
        }

        const duration = toNumber(call.time);

        admin.total_duration += duration;

        if (call.is_answer === true || call.is_answer === 1) {
          admin.answered_duration += duration;
        }

        if (call.user_id) {
          admin.unique_users.add(String(call.user_id));
        }

        if (call.category) {
          admin.categories[call.category] =
            (admin.categories[call.category] || 0) + 1;
        }

        if (call.how_find) {
          admin.sources[call.how_find] =
            (admin.sources[call.how_find] || 0) + 1;
        }

        if (call.reject_reason?.title) {
          const rejectTitle = call.reject_reason.title;

          admin.reject_reasons[rejectTitle] =
            (admin.reject_reasons[rejectTitle] || 0) + 1;
        }

        if (Array.isArray(call.results)) {
          for (const result of call.results) {
            if (!result?.title) continue;

            admin.results[result.title] =
              (admin.results[result.title] || 0) + 1;
          }
        }
      }

      const admins = Array.from(adminsMap.values()).map((admin) => {
        const answeredDurationCount = calls.filter(
          (call) =>
            String(call.admin_id || "unknown") ===
              String(admin.admin_id || "unknown") &&
            (call.is_answer === true || call.is_answer === 1),
        ).length;

        return {
          admin_id: admin.admin_id,
          admin_name: admin.admin_name,
          avatar: admin.avatar,

          total_calls: admin.total_calls,
          answered_calls: admin.answered_calls,
          unanswered_calls: admin.unanswered_calls,

          answer_rate: percentage(admin.answered_calls, admin.total_calls),

          inbound_calls: admin.inbound_calls,
          outbound_calls: admin.outbound_calls,

          total_duration: admin.total_duration,

          average_duration:
            admin.total_calls > 0
              ? Number((admin.total_duration / admin.total_calls).toFixed(2))
              : 0,

          answered_duration: admin.answered_duration,

          average_answered_duration:
            answeredDurationCount > 0
              ? Number(
                  (admin.answered_duration / answeredDurationCount).toFixed(2),
                )
              : 0,

          unique_users: admin.unique_users.size,

          calls_per_user:
            admin.unique_users.size > 0
              ? Number((admin.total_calls / admin.unique_users.size).toFixed(2))
              : 0,

          categories: admin.categories,
          sources: admin.sources,
          results: admin.results,
          reject_reasons: admin.reject_reasons,

          sms_count: smsMessages.filter(
            (sms) =>
              String(sms.admin_id || "unknown") ===
              String(admin.admin_id || "unknown"),
          ).length,
        };
      });

      /*
    |--------------------------------------------------------------------------
    | تحلیل بر اساس دسته‌بندی مشتری
    |--------------------------------------------------------------------------
    */

      const categoriesMap = new Map();

      for (const call of calls) {
        const key = call.category || "UNKNOWN";

        if (!categoriesMap.has(key)) {
          categoriesMap.set(key, {
            category: key,
            total_calls: 0,
            answered_calls: 0,
            unanswered_calls: 0,
            total_duration: 0,
            unique_users: new Set(),
          });
        }

        const item = categoriesMap.get(key);

        item.total_calls += 1;

        if (call.is_answer === true || call.is_answer === 1) {
          item.answered_calls += 1;
        } else {
          item.unanswered_calls += 1;
        }

        item.total_duration += toNumber(call.time);

        if (call.user_id) {
          item.unique_users.add(String(call.user_id));
        }
      }

      const categories = Array.from(categoriesMap.values()).map((item) => ({
        category: item.category,
        total_calls: item.total_calls,
        answered_calls: item.answered_calls,
        unanswered_calls: item.unanswered_calls,

        answer_rate: percentage(item.answered_calls, item.total_calls),

        total_duration: item.total_duration,

        average_duration:
          item.total_calls > 0
            ? Number((item.total_duration / item.total_calls).toFixed(2))
            : 0,

        unique_users: item.unique_users.size,
      }));

      /*
    |--------------------------------------------------------------------------
    | تحلیل بر اساس منبع جذب مشتری
    |--------------------------------------------------------------------------
    */

      const sourcesMap = new Map();

      for (const call of calls) {
        const key = call.how_find || "UNKNOWN";

        if (!sourcesMap.has(key)) {
          sourcesMap.set(key, {
            source: key,
            total_calls: 0,
            answered_calls: 0,
            unique_users: new Set(),
          });
        }

        const item = sourcesMap.get(key);

        item.total_calls += 1;

        if (call.is_answer === true || call.is_answer === 1) {
          item.answered_calls += 1;
        }

        if (call.user_id) {
          item.unique_users.add(String(call.user_id));
        }
      }

      const sources = Array.from(sourcesMap.values()).map((item) => ({
        source: item.source,
        total_calls: item.total_calls,
        answered_calls: item.answered_calls,

        answer_rate: percentage(item.answered_calls, item.total_calls),

        unique_users: item.unique_users.size,
      }));

      /*
    |--------------------------------------------------------------------------
    | تحلیل نتایج تماس
    |--------------------------------------------------------------------------
    */

      const resultsMap = new Map();

      for (const call of calls) {
        if (!Array.isArray(call.results)) continue;

        for (const result of call.results) {
          if (!result?.title) continue;

          const key = String(result.id);

          if (!resultsMap.has(key)) {
            resultsMap.set(key, {
              result_option_id: result.id,
              title: result.title,
              count: 0,
            });
          }

          resultsMap.get(key).count += 1;
        }
      }

      const results = Array.from(resultsMap.values()).sort(
        (a, b) => b.count - a.count,
      );

      /*
    |--------------------------------------------------------------------------
    | تحلیل دلایل رد شدن
    |--------------------------------------------------------------------------
    */

      const rejectReasonsMap = new Map();

      for (const call of calls) {
        const title = call.reject_reason?.title;

        if (!title) continue;

        rejectReasonsMap.set(title, (rejectReasonsMap.get(title) || 0) + 1);
      }

      const rejectReasons = Array.from(rejectReasonsMap.entries())
        .map(([title, count]) => ({
          title,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      /*
    |--------------------------------------------------------------------------
    | روند روزانه تماس‌ها
    |--------------------------------------------------------------------------
    */

      const trendsMap = new Map();

      for (const call of calls) {
        const date = getDateKey(call.date_create_call || call.createdAt);

        if (!trendsMap.has(date)) {
          trendsMap.set(date, {
            date,
            total_calls: 0,
            answered_calls: 0,
            unanswered_calls: 0,
            inbound_calls: 0,
            outbound_calls: 0,
            total_duration: 0,
          });
        }

        const item = trendsMap.get(date);

        item.total_calls += 1;

        if (call.is_answer === true || call.is_answer === 1) {
          item.answered_calls += 1;
        } else {
          item.unanswered_calls += 1;
        }

        if (call.direction === "inbound") {
          item.inbound_calls += 1;
        }

        if (call.direction === "outbound") {
          item.outbound_calls += 1;
        }

        item.total_duration += toNumber(call.time);
      }

      const trends = Array.from(trendsMap.values())
        .map((item) => ({
          ...item,
          answer_rate: percentage(item.answered_calls, item.total_calls),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      /*
    |--------------------------------------------------------------------------
    | تحلیل پیامک‌ها
    |--------------------------------------------------------------------------
    */

      const smsByTargetMap = new Map();

      for (const sms of smsMessages) {
        const target = sms.target || "UNKNOWN";

        smsByTargetMap.set(target, (smsByTargetMap.get(target) || 0) + 1);
      }

      const smsByTarget = Array.from(smsByTargetMap.entries())
        .map(([target, count]) => ({
          target,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      /*
    |--------------------------------------------------------------------------
    | پاسخ نهایی
    |--------------------------------------------------------------------------
    */

      return this.response({
        res,
        data: {
          filters: {
            from: from || null,
            to: to || null,
            admin_id: admin_id || null,
            category: category || null,
            direction: direction || null,
          },

          summary: {
            total_calls: totalCalls,
            answered_calls: answeredCalls,
            unanswered_calls: unansweredCalls,

            answer_rate: percentage(answeredCalls, totalCalls),

            inbound_calls: inboundCalls,
            outbound_calls: outboundCalls,

            total_users: totalUsers,

            calls_per_user:
              totalUsers > 0 ? Number((totalCalls / totalUsers).toFixed(2)) : 0,

            total_duration: totalDuration,

            average_duration:
              totalCalls > 0
                ? Number((totalDuration / totalCalls).toFixed(2))
                : 0,

            answered_duration: answeredDurationTotal,

            average_answered_duration:
              answeredCalls > 0
                ? Number((answeredDurationTotal / answeredCalls).toFixed(2))
                : 0,

            total_sms: smsMessages.length,
          },

          admins,
          categories,
          sources,
          results,
          reject_reasons: rejectReasons,
          sms_by_target: smsByTarget,
          trends,
        },
      });
    } catch (error) {
      console.error("salesplusAnalytics error:", error);

      return res.status(500).json({
        success: false,
        message: "خطا در دریافت آنالیز تیم فروش",
        error: error.message,
      });
    }
  }
};

module.exports = new Controller();
