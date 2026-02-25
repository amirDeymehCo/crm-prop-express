const Controllers = require("../../../controllers");
const Ticket = require("../../../../models/Ticket");
const Message = require("../../../../models/Message");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const User = require("../../../../models/User");
const founcList = require("../../../../utils/List");
const { Op } = require("sequelize");
const shahkarInquiry = require("../../../../services/ShahkarInquiry");

const Controller = class extends Controllers {
  async create(req, res) {
    const files = req?.files?.map((e, i) => e?.filename);

    const status = {
      ticket: "ticket_open",
      widthdraw: "widthdraw_requsted",
      kyc: "kvc_pending",
    };

    if (req?.body?.type === "widthdraw") {
      if (!req?.body?.userChallenge || req?.body?.userChallenge == "null")
        return this.response({
          res,
          status: 400,
          message: "کاربر مای پراپ، شما باید چالش خود را انتخاب نمایید",
        });

      const chFind = await UserChallenge.findByPk(req?.body?.userChallenge);
      if (!chFind) {
        return this.response({
          res,
          status: 400,
          message: "چالشی با این شناسه ارسالی یافت نشد",
        });
      }

      if (chFind?.current_phase_index !== 3) {
        return this.response({
          res,
          status: 400,
          message: "چالش شما هنوز به مرحله ی ریل نرسیده است",
        });
      }
    }

    const newTicket = await Ticket.create({
      departeman: req?.body?.departeman,
      user_id: req?.user?.id,
      title: req?.body?.title,
      priority: req?.body?.priority,
      status: status[req?.body?.stauts],
      type: req?.body?.type || "ticket",
      userChallenge: req?.body?.userChallenge || null,
      files: [],
    });
    await Message.create({
      text: req?.body?.message,
      ticket_id: newTicket?.id,
      senderType: "user",
      files,
    });

    if (req?.body?.type === "kyc") {
      await User.update(
        { kyc_status: "pending", kyc_steep: "one" },
        { where: { id: req?.user?.id } },
      );
    }

    this.response({
      res,
      status: 201,
      message:
        "کاربر مای پراپ، درخواست تیکت شما با موفقیت ثبت شد، منتظر پاسخ پشتیبان باشید",
      data: newTicket,
    });
  }
  async list(req, res) {
    const { query } = req;
    const where = {
      user_id: req?.user?.id,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.userChallenge) {
      where.userChallenge = query.userChallenge;
    }
    if (query.from || query.to) {
      where.created_at = {};
      if (query.from) {
        where.created_at[Op.gte] = new Date(query.from);
      }
      if (query.to) {
        where.created_at[Op.lte] = new Date(query.to);
      }
    }

    const resData = await founcList(Ticket, req, where, {
      include: [
        {
          model: UserChallenge,
          as: "challenge",
          attributes: ["id", "current_phase_index"],
          include: [
            {
              model: ChallengePlan,
              attributes: ["id", "title", "balance"],
              include: [ChallengeType],
            },
          ],
        },
      ],
    });
    this.response({
      res,
      status: 200,
      message: "لیست تیکت ها",
      data: resData,
    });
  }
  async find(req, res) {
    const findTicket = await Ticket.findOne({
      where: { id: req?.params?.id, user_id: req?.user?.id },
    });
    if (!findTicket)
      return this.response({
        res,
        status: 400,
        message: "شناسه تیکت اشتباه است",
      });
    const listChats = await Message.findAll({
      where: { ticket_id: findTicket?.id },
    });

    this.response({
      res,
      status: 200,
      message: "اطلاعات تیکت + پیام ها",
      data: {
        ticket: findTicket,
        chats: listChats,
      },
    });
  }
  async sendMessage(req, res) {
    const findTicket = await Ticket.findOne({
      where: { id: req?.params?.id, user_id: req?.user?.id },
    });
    if (!findTicket)
      return this.response({
        res,
        status: 400,
        message: "شناسه تیکت اشتباه است",
      });

    const filesList = req?.files?.map((e) => e?.filename);
    const newMessage = await Message.create({
      ticket_id: req?.params?.id,
      text: req?.body?.message,
      senderType: "user",
      files: filesList,
    });

    this.response({ res, status: 200, message: "پیام شما با موفقیت ارسال شد" });
  }
  async checkNationcode(req, res) {
    const resultShahkar = await shahkarInquiry(
      req?.user?.mobile,
      req?.body?.nationcode,
    );

    console.log(resultShahkar);

    // 1️⃣ خطاهای سیستمی یا ولیدیشن
    if (!resultShahkar || resultShahkar.matched === null) {
      return this.response({
        res,
        status: 400,
        message:
          resultShahkar?.message || "مشکلی پیش آمده است بعدا امتحان نمایید",
      });
    }

    // 2️⃣ عدم تطابق کد ملی و موبایل
    if (resultShahkar.matched === false) {
      return this.response({
        res,
        status: 400,
        message: "شما بایستی کد ملی صاحب شماره تلفن را وارد نمایید",
      });
    }

    // 3️⃣ تطابق موفق
    if (resultShahkar.matched === true) {
      return this.response({
        res,
        status: 200,
        message: "تطابق کد ملی و شماره موبایل با موفقیت انجام شد",
      });
    }

    // 4️⃣ fallback (نباید به ایجا برسیم)
    return this.response({
      res,
      status: 400,
      message: "مشکلی پیش آمده است بعدا امتحان نمایید",
    });
  }
};

module.exports = new Controller();
