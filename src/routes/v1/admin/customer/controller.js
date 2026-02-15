const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const Admin = require("../../../../models/Admin");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const Call = require("../../../../models/Call/Call");
const Note = require("../../../../models/Call/Note");
const CallRejectReason = require("../../../../models/Call/CallRejectReason");
const CallResultOption = require("../../../../models/Call/CallResultOption");
const SmsMessage = require("../../../../models/SmsMessage");
const sequelize = require("../../../../../db");
const founcList = require("../../../../utils/List");
const { sendCustomMessage } = require("../../../../services/KavenegarService");
const { Op } = require("sequelize");

const Controller = class extends Controllers {
  async getData(req, res) {
    const { mobile } = req?.body;
    const findUser = await User.findOne({
      where: { mobile },
      attributes: { exclude: ["password"] },
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
    const findUser = await User.findOne({ id: body?.user_id });
    if (!findUser)
      this.response({
        res,
        status: 400,
        message: "کاربری با این شناسه پیدا نشد",
      });

    // create responsible
    if (body?.responsible) {
      if (findUser?.responsible_admin_id)
        return this.response({
          res,
          status: 400,
          message: "مدیریت این کاربر قبلا انتخاب شده است",
        });

      await User.update(
        { responsible_admin_id: admin?.id },
        { where: { id: body?.user_id } },
      );
    }

    const t = await sequelize.transaction();
    const result_option_ids = body?.result_option_ids
      ? body?.result_option_ids
      : [];

    if (body?.is_answer == false && !body?.reject_reason_id) {
      return this.response({
        res,
        status: 400,
        message: "باید دلیل پاسخ ندادن انتخاب شود",
      });
    }

    const newCall = await Call.create(
      {
        ...body,
        reject_reason_id: body?.reject_reason_id || null,
        user_id: body?.user_id,
        admin_id: admin?.id,
      },
      { transaction: t },
    );
    if (body?.is_answer == true) {
      if (Array.isArray(result_option_ids) && result_option_ids.length > 0) {
        await newCall.setResults(result_option_ids, { transaction: t });
      } else {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "باید نتیجه تماس را انتخاب کنید",
        });
      }
    }

    await t.commit();
    this.response({ res, status: 200, message: "تماس با موفقیت ساخته شد" });
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
    const findUser = await User?.findByPk(req?.body?.user_id);
    if (!findUser)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این شناسه یافت نشد",
      });

    const sendSms = await sendCustomMessage({
      receptor: findUser?.mobile,
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
              order: [["createdAt", "DESC"]],
            },
          ],
        },
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "mobile", "name", "avatar"],
        },
      ],
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
};

module.exports = new Controller();
