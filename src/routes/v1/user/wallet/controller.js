const Controllers = require("../../../controllers");
const { paykanService } = require("../../../../services/PeykanPayment")
const { createDepositUSDInvoice, handleIpnCallback } = require("../../../../services/NOWPayments")
const Wallet = require("../../../../models/Wallet")
const Payment = require("../../../../models/Payment")
const WidthdrawRequest = require("../../../../models/WidthdrawRequest")
const WalletTransaction = require("../../../../models/WalletTransaction")
const Order = require("../../../../models/Order")
const Otp = require("../../../../models/Otp")
const founcList = require("../../../../utils/List")
const sequelize = require("../../../../../db")
const { generateCode, sendCode } = require("../../../../services/KavenegarService")

const Controller = class extends Controllers {
  async depositIRR(req, res) {
    try {
      const userId = req?.user?.id;
      const { amount_usd } = req.body;

      if (!amount_usd || Number(amount_usd) <= 0) {
        return res.status(400).json({ message: "لطفا مبلغ را درست وارد کنید" });
      }
      const { redirectUrl } = await paykanService({
        userId,
        amountUsd: amount_usd,
      });

      return this.response({
        res,
        status: 200,
        message: "درحال انتقال به درگاه پرداخت...",
        data: { url: redirectUrl },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "gateway error" });
    }
  }
  async depositIRRCallback(req, res) {
    // #1 update payment 
    const paymentFind = await Payment.findOne({ where: { order_id: req?.body?.order_id, } })
    const orderFind = await Order.findOne({ where: { gateway_order_id: req?.body?.order_id, } })
    if (!paymentFind || !orderFind) return this.response({ status: 400, message: "تراکنشی یافت نشد", res })
    if (!["pending", "waiting"]?.includes(paymentFind?.status)) return this.response({ res, status: 400 })

    await Payment.update(
      {
        status: req?.body?.status?.toLowerCase(),
        provider_payment_id: req?.body?.tracking_code
      },
      {
        where: { order_id: req?.body?.order_id }
      }
    );


    // #update order 
    await orderFind.update({ status: req?.body?.status?.toLowerCase(), paid_at: new Date() })

    // #2 create transactions and update wallet user
    const walletUser = await Wallet.findOne({ where: { user_id: req?.user?.id } })

    await WalletTransaction.create({
      type: "deposit",
      amount: paymentFind?.amount_usd,
      balance_before: walletUser?.balance,
      balance_after: Number(walletUser?.balance) + Number(paymentFind?.amount_usd),
      ref_id: req?.body?.ref_num,
      status: "completed",
      meta: JSON.stringify(req?.body),
      wallet_id: walletUser?.id
    })

    walletUser.balance = Number(walletUser?.balance) + Number(paymentFind?.amount_usd)
    await walletUser.save()

    this.response({ res, status: 200, message: "کاربر مای پراپ عملیات شما با موفقیت انجام شد" })
  }
  async depositUSD(req, res, next) {
    try {
      const { amount_usd } = req.body;
      const user = req.user;

      const { invoiceUrl, payment } = await createDepositUSDInvoice({
        user,
        amountUsd: amount_usd,
      });

      res.status(200).json({
        message: "درحال انتقال به درگاه پرداخت...",
        data: {
          url: invoiceUrl,
          payment_id: payment.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
  async ipnNowPayment(req, res) {
    const signature = req.headers["x-nowpayments-sig"];
    const body = req.body;
    const payment = await handleIpnCallback(body, signature);

    return res.status(200).json({ success: true });
  }
  async createOtpWidhdraw(req, res) {
    const newCode = generateCode(4);
    const sent = await sendCode({ receptor: req?.user?.mobile, token: newCode });
    if (!sent) {
      return this.response({
        res,
        status: 500,
        message: "در ارسال کد تایید مشکلی پیش آمده است، بعدا امتحان کنید",
      });
    }

    await Otp.create({
      mobile: req?.user?.mobile,
      code: newCode,
      status: "waiting",
    });

    this.response({ res, status: 200, message: "کد تایید به تلفن همراه شما ارسال شد" })
  }
  async widthdrawRequest(req, res) {
    const { wallet_address, amount_usd } = req?.body

    const mobile = String(req.user.mobile).trim();
    const code = String(req.body.code).trim();

    const otp = await Otp.findOne({
      where: { mobile, status: "waiting" },
      order: [["createdAt", "DESC"]], // اگه چند تا OTP هست، آخریش
    });

    if (!otp) {
      return this.response({
        res,
        status: 400,
        message: "کدی برای این شماره تلفن ارسال نشده است",
      });
    }

    const pastTime = Date.now() - new Date(otp.createdAt).getTime();

    if (pastTime >= 2 * 60 * 1000) {
      otp.status = "expired";
      await otp.save();

      return this.response({
        res,
        status: 400,
        message: "کد ارسالی منقضی شده است",
      });
    }

    if (String(otp.code) !== code) {
      return this.response({
        res,
        status: 400,
        message: "کد ارسالی اشتباه است",
      });
    } else {
      otp.status = "verify";
      await otp.save();
    }


    const widthStatusWiaings = await WidthdrawRequest.findOne({ where: { status: "waiting", user_id: req?.user?.id } });
    if (widthStatusWiaings) return this.response({ res, status: 400, message: "کاربر گرامی، شما یک درخواست برداشت قبلا ثبت کرده اید" })


    const wallet = await Wallet.findOne({ where: { user_id: req?.user?.id } })
    if (!wallet || (parseFloat(wallet?.balance) < parseFloat(amount_usd))) return this.response({ res, status: 400, message: "موچودی ولت شما کمتر از مقدار درخواستی هست" })

    await WidthdrawRequest.create({ wallet_address, amount: parseFloat(amount_usd), status: "waiting", user_id: req?.user?.id })
    this.response({ res, status: 200, message: "کاربر مای پراپ درخواست برداشت شما ثبت شد!" })
  }
  async transactionsList(req, res) {
    const where = {};
    const { query: { type, status } } = req

    if (type) where.type = type;
    if (status) where.status = status;

    const transactions = await founcList(Order, req, where, { attributes: { exclude: ["meta"] } });
    this.response({ res, message: "تاریختچه تراکنش ها", data: transactions })
  }
  async states(req, res) {
    const stats = await WalletTransaction.findAll({
      where: { wallet_id: req?.user?.wallet?.id },
      attributes: [
        "type",
        "status",
        [sequelize.fn("SUM", sequelize.col("amount")), "total"]
      ],
      group: ["type"]
    });

    let totals = {
      total_deposit: 0,
      total_spent: 0,
      total_expired: 0,
      total_withdraw: 0,
    };

    stats.forEach(row => {
      const type = row.type;
      const total = parseFloat(row.dataValues.total);

      if (row?.status === "harvested" || row?.status === "failed") totals.total_expired = total;
      else {
        if (type === "deposit") totals.total_deposit = total;
        if (type === "transfer_out") totals.total_spent = total;
        if (type === "withdraw") totals.total_withdraw = total;
      }
    });


    this.response({ res, message: "اطلاعات ولت", data: totals })
  }
};

module.exports = new Controller();
