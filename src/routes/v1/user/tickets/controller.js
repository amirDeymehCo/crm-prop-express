const Controllers = require("../../../controllers");
const Ticket = require("../../../../models/Ticket");
const Message = require("../../../../models/Message");
const founcList = require("../../../../utils/List");
const { Op } = require("sequelize");

const Controller = class extends Controllers {
  async create(req, res) {
    const newTicket = await Ticket.create({
      departeman: req?.body?.departeman, user_id: req?.user?.id, title: req?.body?.title, priority: req?.body?.priority, status: "ticket_open", type: req?.body?.type || "ticket", userChallenge: req?.body?.userChallenge || null
    });
    await Message.create({ text: req?.body?.message, ticket_id: newTicket?.id, senderType: "user" })


    this.response({
      res,
      status: 201,
      message: "کاربر مای پراپ، درخواست تیکت شما با موفقیت ثبت شد، منتظر پاسخ پشتیبان باشید",
      data: newTicket
    });
  }
  async list(req, res) {
    const { query } = req
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

    const resData = await founcList(Ticket, req, where)
    this.response({
      res,
      status: 200,
      message: "لیست تیکت ها",
      data: resData
    });
  }
  async find(req, res) {
    const findTicket = await Ticket.findByPk(req?.params?.id);
    if (!findTicket) return this.response({ res, status: 400, message: "شناسه تیکت اشتباه است" });
    const listChats = await Message.findAll({ where: { ticket_id: findTicket?.id, } })

    this.response({
      res,
      status: 200,
      message: "اطلاعات تیکت + پیام ها",
      data: {
        ticket: findTicket,
        chats: listChats
      }
    })
  }
  async sendMessage(req, res) {
    const findTicket = await Ticket.findByPk(req?.params?.id);
    if (!findTicket) return this.response({ res, status: 400, message: "شناسه تیکت اشتباه است" });


    const filesList = req?.files?.map(e => e?.filename)
    console.log("filesList=>", filesList)
    const newMessage = await Message.create({ ticket_id: req?.params?.id, text: req?.body?.message, senderType: "user", files: filesList })

    this.response({ res, status: 200, message: "پیام شما با موفقیت ارسال شد", })


  }
};

module.exports = new Controller();
