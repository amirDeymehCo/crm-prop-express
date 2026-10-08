const Controllers = require("../../../controllers");
const Ticket = require("../../../../models/Ticket");
const User = require("../../../../models/User");
const Admin = require("../../../../models/Admin");
const Wallet = require("../../../../models/Wallet");
const WidthdrawRequest = require("../../../../models/WidthdrawRequest");
const RequestWithdrawLogs = require("../../../../models/request_withdraw_logs");
const WalletTransaction = require("../../../../models/WalletTransaction");
const founcList = require("../../../../utils/List");

const Controller = class extends Controllers {
  async list(req, res) {
    const whare = {};
    if (req?.query?.user_id) whare.user_id = req?.query?.user_id;
    if (req?.query?.status) whare.status = req?.query?.status;
    if (req?.query?.method) whare.method = req?.query?.method;

    const tickets = await founcList(WidthdrawRequest, req, whare, {
      include: [
        {
          model: User,
          attributes: ["id", "avatar", "firstname", "lastname", "mobile"],
        },
      ],
      order: [["createdAt", "DESC"]],
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
    // ⚠️ include باید داخل همان آبجکت اول باشد؛ قبلاً پارامتر دوم به
    // findOne پاس می‌شد و Sequelize آن را نادیده می‌گرفت، پس اطلاعات کاربر
    // هیچ‌وقت برنمی‌گشت.
    const requestWithdraw = await WidthdrawRequest.findOne({
      where: { id: req?.params?.id },
      include: [
        {
          model: User,
          attributes: [
            "id",
            "firstname",
            "lastname",
            "avatar",
            "mobile",
            "sheba",
          ],
        },
      ],
    });
    if (!requestWithdraw)
      return this.response({
        res,
        status: 400,
        message: "شناسه برداشت اشتباه است",
      });

    const logsList = await founcList(
      RequestWithdrawLogs,
      req,
      {
        log_id: requestWithdraw?.id,
      },
      {
        include: [
          {
            model: Admin,
            attributes: ["id", "name", "avatar"],
          },
        ],
      },
    );

    this.response({
      res,
      status: 200,
      message: "اطلاعات برداشت ",
      data: { request: requestWithdraw, logs: logsList },
    });
  }
  async updateReqeust(req, res) {
    const requestWithdraw = await WidthdrawRequest.findOne({
      where: { id: req?.body?.id },
    });
    if (!requestWithdraw)
      return this.response({
        res,
        status: 400,
        message: "شناسه برداشت اشتباه است",
      });

    const oldStatus = requestWithdraw?.status;

    if (oldStatus === "request_canceled")
      return this.response({
        res,
        status: 400,
        message:
          "ادمین گرامی، وضعیت درخواست برداشت از ولت قبلا کنسل شده و امکان ویرایش مجدد نمیباشد",
      });
    if (oldStatus === "request_paid")
      return this.response({
        res,
        status: 400,
        message:
          "ادمین گرامی، وضعیت درخواست برداشت از ولت قبلا به پرداخت شده تغییر کرده است و امکان ویرایش مجدد نمیباشد",
      });

    const newStatus = req?.body?.status;
    const adminNote = String(req?.body?.admin_note || "").trim();
    const paymentReference = String(req?.body?.payment_reference || "").trim();

    // ادمین موقع کنسل کردن باید دلیلش را بنویسد؛ این متن در پنل کاربر
    // نمایش داده می‌شود.
    if (newStatus === "request_canceled" && !adminNote) {
      return this.response({
        res,
        status: 400,
        message: "ادمین گرامی، برای کنسل کردن درخواست باید توضیحات وارد کنید",
      });
    }

    // برای برداشت ریالی، ثبت شماره پیگیری واریز بانکی الزامی است
    if (
      newStatus === "request_paid" &&
      requestWithdraw?.method === "irr" &&
      !paymentReference &&
      !requestWithdraw?.payment_reference
    ) {
      return this.response({
        res,
        status: 400,
        message: "ادمین گرامی، شماره پیگیری واریز را وارد کنید",
      });
    }

    if (newStatus === "request_canceled") {
      const wallet = await Wallet.findOne({
        where: { user_id: requestWithdraw?.user_id },
      });

      const balanceBefore = Number(wallet?.balance);
      const balanceAfter = balanceBefore + Number(requestWithdraw?.amount);

      await WalletTransaction.create({
        type: "deposit",
        amount: Number(requestWithdraw?.amount),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        status: "completed",
        actor_type: "admin",
        admin_id: req?.admin?.id || null,
        wallet_id: wallet?.id,
        reference_id: String(requestWithdraw?.id),
        description: `آزاد شدن مبلغ ${Number(requestWithdraw?.amount)?.toLocaleString()} دلار به دلیل کنسل شدن درخواست برداشت`,
      });
      await wallet.update({ balance: balanceAfter });
    }

    await requestWithdraw.update({
      status: newStatus,
      is_canceled_reqeust: newStatus === "request_canceled" ? "1" : "0",
      description: req?.body?.description || requestWithdraw?.description,
      admin_note: adminNote || requestWithdraw?.admin_note,
      payment_reference: paymentReference || requestWithdraw?.payment_reference,
    });

    ///
    await RequestWithdrawLogs.create({
      old_status: oldStatus,
      new_status: newStatus,
      admin_id: req?.admin?.id,
      log_id: requestWithdraw?.id,
    });

    this.response({ res, message: "اطلاعات با موفقیت ثبت شد" });
  }
};

/// amidwajdiawjid jaw

module.exports = new Controller();
