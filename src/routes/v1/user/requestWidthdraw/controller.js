const Controllers = require("../../../controllers");
const Ticket = require("../../../../models/Ticket");
const Message = require("../../../../models/Message");
const Wallet = require("../../../../models/Wallet");
const WidthdrawRequest = require("../../../../models/WidthdrawRequest");
const founcList = require("../../../../utils/List");
const { Op } = require("sequelize");

const Controller = class extends Controllers {
  async create(req, res) {
    const newTicket = await Ticket.create({ departeman: req?.body?.departeman, user_id: req?.user?.id, title: req?.body?.title, priority: req?.body?.priority, status: "ticket_open" });
    await Message.create({ text: req?.body?.message, ticket_id: newTicket?.id, senderType: "user" })

    this.response({
      res,
      status: 201,
      message: "کاربر مای پراپ، درخواست تیکت شما با موفقیت ثبت شد، منتظر پاسخ پشتیبان باشید",
      data: newTicket
    });
  }
  async widthdrawRequestFounc(req, res) {
    const { wallet_address, amount_usd } = req?.body
    const widthStatusWiaings = await WidthdrawRequest.findOne({ where: { status: "waiting", user_id: req?.user?.id } });
    if (widthStatusWiaings) return this.response({ res, status: 400, message: "کاربر گرامی، شما یک درخواست برداشت قبلا ثبت کرده اید" })


    const wallet = await Wallet.findOne({ where: { user_id: req?.user?.id } })
    if (!wallet || (parseFloat(wallet?.balance) < parseFloat(amount_usd))) return this.response({ res, status: 400, message: "موچودی ولت شما کمتر از مقدار درخواستی هست" })

    await WidthdrawRequest.create({ wallet_address, amount: parseFloat(amount_usd), status: "waiting", user_id: req?.user?.id })
    this.response({ res, status: 200, message: "کاربر مای پراپ درخواست برداشت شما ثبت شد!" })

  }
  async list(req, res) {
    const { query } = req
    const where = {
      user_id: req?.user?.id,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.challenge_id) {
      where.challenge_id = query.challenge_id;
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
