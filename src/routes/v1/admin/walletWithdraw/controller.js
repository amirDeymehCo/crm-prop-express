const Controllers = require("../../../controllers");
const Ticket = require("../../../../models/Ticket");
const User = require("../../../../models/User");
const WidthdrawRequest = require("../../../../models/WidthdrawRequest");
const founcList = require("../../../../utils/List");

const Controller = class extends Controllers {
  async list(req, res) {
    const whare = {};
    if (req?.query?.user_id) whare.user_id = req?.query?.user_id;
    if (req?.query?.status) whare.status = req?.query?.status;

    const tickets = await founcList(WidthdrawRequest, req, whare, {
      include: [
        {
          model: User,
          attributes: ["id", "avatar", "firstname", "lastname", "mobile"],
        },
      ],
    });

    this.response({
      res,
      status: 200,
      data: tickets,
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
    const requestWithdraw = await WidthdrawRequest.findOne(
      { where: { id: req?.params?.id } },
      {
        include: [
          {
            model: User,
            attributes: ["id", "firstname", "lastname", "avatar"],
          },
        ],
      },
    );
    if (!requestWithdraw)
      return this.response({
        res,
        status: 400,
        message: "شناسه برداشت اشتباه است",
      });

    this.response({
      res,
      status: 200,
      message: "اطلاعات برداشت ",
      data: requestWithdraw,
    });
  }
  async updateReqeust(req, res) {
    const requestWithdraw = await WidthdrawRequest.update(req?.body, {
      where: { id: req?.body?.id },
    });
    if (!requestWithdraw)
      return this.response({
        res,
        status: 400,
        message: "شناسه برداشت اشتباه است",
      });

    this.response({ res, message: "اطلاعات با موفقیت ثبت شد" });
  }
};

module.exports = new Controller();
