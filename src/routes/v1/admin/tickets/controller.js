const Controllers = require("../../../controllers");
const Ticket = require("../../../../models/Ticket");
const User = require("../../../../models/User");
const Message = require("../../../../models/Message");
const Admin = require("../../../../models/Admin");
const AutoMessage = require("../../../../models/AutoMessage");
const TicketNots = require("../../../../models/TicketNots");
const founcList = require("../../../../utils/List");
const { sendCustomMessage } = require("../../../../services/KavenegarService");
const { Op } = require("sequelize");

const Controller = class extends Controllers {
  async list(req, res) {
    const where = {};

    if (req?.query?.user_id) where.user_id = req?.query?.user_id;
    if (req?.query?.admin_id) where.admin_id = req?.query?.admin_id;
    if (req?.query?.status) where.status = req?.query?.status;
    if (req?.query?.priority) where.priority = req?.query?.priority;
    if (req?.query?.id) where.id = req?.query?.id;

    if (req?.query?.title) {
      where.title = { [Op.like]: `%${req?.query?.title}%` };
    }

    if (req?.query?.type === "widthdraw") {
      where[Op.or] = [
        { departeman: "request_widthdraw" },
        { type: "widthdraw" },
      ];
    } else {
      where.departeman = { [Op.ne]: "request_widthdraw" };
      where.type = { [Op.ne]: "widthdraw" };
    }

    try {
      const tickets = await founcList(Ticket, req, where, {
        include: [
          {
            model: User,
            attributes: ["id", "avatar", "firstname", "lastname"],
          },
          {
            model: Admin,
            attributes: ["id", "avatar", "name"],
          },
        ],
        order: [["updatedAt", "DESC"]],
      });

      return this.response({
        res,
        status: 200,
        data: tickets,
      });
    } catch (error) {
      return this.response({
        res,
        status: 500,
        message: "Internal Server Error",
        data: error.message,
      });
    }
  }
  async create(req, res) {
    const files = req?.files?.map((e, i) => e?.filename);

    const newTicket = await Ticket.create({
      departeman: req?.body?.departeman,
      user_id: req?.body?.user_id,
      title: req?.body?.title,
      priority: req?.body?.priority,
      status: "ticket_open",
      type: "ticket",
      userChallenge: req?.body?.userChallenge || null,
      files,
      createdByAdmin: true,
      admin_id: req?.admin?.id,
    });
    await Message.create({
      text: req?.body?.message,
      ticket_id: newTicket?.id,
      senderType: "admin",
    });

    this.response({
      res,
      status: 201,
      message: "ادمین مای پراپ، تیکت شما با موفقیت برای کاربر ساخته شد",
      data: newTicket,
    });
  }
  async update(req, res) {
    const newData = {
      departeman: req?.body?.departeman,
      user_id: req?.body?.user_id,
      title: req?.body?.title,
      priority: req?.body?.priority,
      userChallenge: req?.body?.userChallenge || null,
      createdByAdmin: true,
    };

    if (req?.body?.departeman === "request_widthdraw")
      newData.type = "widthdraw";
    if (req?.body?.status) newData.status = req?.body?.status;

    const newTicket = await Ticket.update(newData, {
      where: { id: req?.params?.id },
    });

    this.response({
      res,
      status: 200,
      message: "ادمین مای پراپ، تیکت شما با موفقیت برای کاربر ویرایش شد",
      data: newTicket,
    });
  }
  async find(req, res) {
    const findTicket = await Ticket.findByPk(req?.params?.id, {
      include: [
        {
          model: Admin,
          attributes: ["id", "name", "avatar"],
        },
        {
          model: User,
          attributes: ["id", "firstname", "lastname", "mobile", "avatar"],
        },
      ],
    });
    if (!findTicket)
      return this.response({
        res,
        status: 400,
        message: "شناسه تیکت اشتباه است",
      });

    if (
      findTicket?.departeman === "request_widthdraw" &&
      !req?.admin?.permissions?.includes("profit.list")
    ) {
      return this.response({
        res,
        status: 400,
        message: "شما دسترسی به مشاهده تیکت برداشت سود ندارید",
      });
    }

    const listChats = await Message.findAll({
      where: { ticket_id: findTicket?.id },
      include: [{ model: Admin, attributes: ["id", "name"] }],
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
    const findTicket = await Ticket.findByPk(req?.params?.id, {
      include: [{ model: User, attributes: ["id", "mobile"] }],
    });
    if (!findTicket)
      return this.response({
        res,
        status: 400,
        message: "شناسه تیکت اشتباه است",
      });

    if (
      findTicket?.departeman === "request_widthdraw" &&
      !req?.admin?.permissions?.includes("profit.list")
    ) {
      return this.response({
        res,
        status: 400,
        message: "شما دسترسی به مشاهده تیکت برداشت سود ندارید",
      });
    }

    const filesList = req?.files?.map((e) => e?.filename);
    const newMessage = await Message.create({
      ticket_id: req?.params?.id,
      text: req?.body?.message,
      senderType: "admin",
      files: filesList,
      admin_id: req?.admin?.id,
    });

    if (findTicket?.status === "ticket_open") {
      await Ticket.update(
        { admin_id: req?.admin?.id, status: "ticket_answered" },
        { where: { id: findTicket?.id } },
      );
    } else {
      await Ticket.update(
        { admin_id: req?.admin?.id },
        { where: { id: findTicket?.id } },
      );
    }

    // try {
    //   const sendSms = await sendCustomMessage({
    //     receptor: findTicket?.User?.mobile,
    //     message: `کاربر مای پراپ، پاسخی برای تیکت ${findTicket?.id} شما ثبت شد.`,
    //   });
    // } catch (err) {
    //   console.log(err);
    // }

    this.response({ res, status: 200, message: "پیام شما با موفقیت ارسال شد" });
  }
  async editMessage(req, res) {
    const { messageId } = req.params; // فرض بر این است که شناسه پیام در Route پاس داده می‌شود: /tickets/messages/:messageId

    const findMessage = await Message.findByPk(messageId);
    if (!findMessage) {
      return this.response({
        res,
        status: 404,
        message: "پیام مورد نظر یافت نشد",
      });
    }

    let filesList = findMessage.files;
    if (req.files && req.files.length > 0) {
      filesList = req.files.map((e) => e.filename);
    }

    await Message.update(
      {
        text: req.body.message || findMessage.text,
        files: filesList,
      },
      {
        where: { id: messageId },
      },
    );

    this.response({
      res,
      status: 200,
      message: "پیام شما با موفقیت ویرایش شد",
    });
  }
  async autoMessages(req, res) {
    const list = await AutoMessage.findAll();

    this.response({ res, status: 200, data: list });
  }
  async createMessage(req, res) {
    const list = await AutoMessage.create(req?.body);

    this.response({ res, status: 200, data: list });
  }
  async notesList(req, res) {
    const list = await TicketNots.findAll({
      where: { ticket_id: req?.params?.id },
      include: [
        {
          model: Admin,
          attributes: ["id", "name", "avatar"],
        },
      ],
    });

    this.response({ res, data: list });
  }
  async createNote(req, res) {
    if (!req?.body?.ticket_id)
      return this.response({
        res,
        status: 400,
        message: "ارسال شناسه تیکت احباری است",
      });
    if (!req?.body?.note)
      return this.response({
        res,
        status: 400,
        message: "یادداشت را وارد نمایید",
      });

    await TicketNots.create({
      ticket_id: req?.body?.ticket_id,
      note: req?.body?.note,
      admin_id: req?.admin?.id,
    });

    this.response({ res, message: "یادداشت ساخته شد" });
  }
  async delteMessage(req, res) {
    const msg = await AutoMessage.destroy({ where: { id: req?.body?.id } });

    if (!msg)
      return this.response({
        res,
        status: 400,
        message: "پیام آماده پیدا نشد",
      });

    this.response({ res, status: 200, message: "پیام با موفقیت حذف شد " });
  }
  async updtaeAutoMessage(req, res) {
    const msg = await AutoMessage.update(req?.body, {
      where: { id: req?.body?.id },
    });

    if (!msg)
      return this.response({
        res,
        status: 400,
        message: "پیام آماده پیدا نشد",
      });

    this.response({
      res,
      status: 200,
      message: "پیام با موفقیت ویرایش شد ",
    });
  }
  async adminLists(req, res) {
    const list = await Admin.findAll({
      attributes: ["id", "name", "mobile"],
      // where: { role: "support" },
    });

    this.response({ res, data: list });
  }
};

module.exports = new Controller();
