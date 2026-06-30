const Controllers = require("../../../controllers");
const Ticket = require("../../../../models/Ticket");
const User = require("../../../../models/User");
const Message = require("../../../../models/Message");
const Admin = require("../../../../models/Admin");
const founcList = require("../../../../utils/List");

const Controller = class extends Controllers {
  async list(req, res) {
    const whare = { type: "kyc" };
    if (req?.query?.user_id) whare.user_id = req?.query?.user_id;
    if (req?.query?.admin_id) whare.admin_id = req?.query?.admin_id;
    if (req?.query?.status) whare.status = req?.query?.status;
    if (req?.query?.priority) whare.priority = req?.query?.priority;
    if (req?.query?.type) whare.type = req?.query?.type;

    const tickets = await founcList(Ticket, req, whare, {
      include: [
        {
          model: User,
          attributes: ["id", "avatar", "firstname", "lastname", "mobile"],
        },
        {
          model: Admin,
          attributes: ["id", "avatar", "name"],
        },
      ],
    });

    this.response({
      res,
      status: 200,
      data: tickets,
    });
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
    const findTicket = await Ticket.findOne(
      { where: { id: req?.params?.id, type: "kyc" } },
      {
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
      },
    );
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
    const findTicket = await Ticket.findByPk(req?.params?.id);
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
      senderType: "admin",
      files: filesList,
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

    this.response({ res, status: 200, message: "پیام شما با موفقیت ارسال شد" });
  }
  async changeStauts(req, res) {
    const findTicket = await Ticket.findOne({
      where: { id: req?.body?.ticket_id, type: "kyc" },
    });

    if (!findTicket)
      return this.response({
        res,
        status: 400,
        message: "احراز هویتی پیدا نشد",
      });

    if (findTicket?.status === req?.body?.status) {
      return this.response({
        res,
        status: 400,
        message: "وضعیت ارسالی با وضعیت فعلی یکی است",
      });
    }

    // updated user kyc_status
    const newStatus = {
      ticket_open: "pending",
      kvc_pending: "pending",
      kyc_closed: "rejected",
      kvc_approved: "approved",
    };

    await User.update(
      { kyc_status: newStatus[req?.body?.stauts] },
      { where: { id: findTicket?.user_id } },
    );

    await findTicket.update({ status: req?.body?.status });
    this.response({ res, status: 200, message: "وضعیت احراز هویت اپدیت شد" });
  }
};

module.exports = new Controller();
