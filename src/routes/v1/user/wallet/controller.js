const Controllers = require("../../../controllers");
const { paykanService } = require("../../../../services/PeykanPayment")
const { createDepositUSDInvoice, handleIpnCallback } = require("../../../../services/NOWPayments")
const Wallet = require("../../../../models/Wallet")
const Payment = require("../../../../models/Payment")
const WidthdrawRequest = require("../../../../models/WidthdrawRequest")
const WalletTransaction = require("../../../../models/WalletTransaction")
const founcList = require("../../../../utils/List")
const sequelize = require("../../../../../db")

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
        message: "redirect to gateway",
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
    if (!paymentFind) return this.response({ status: 400, message: "تراکنشی یافت نشد", res })
    if (!["pending", "waiting"]?.includes(paymentFind?.status)) return this.response({ res, status: 400, message: "وضعیت تراکنش منتظر پرداخت نیست" })

    await Payment.update(
      {
        status: req?.body?.status?.toLowerCase(),
        provider_payment_id: req?.body?.tracking_code
      },
      {
        where: { order_id: req?.body?.order_id }
      }
    );

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
        message: "Invoice created",
        data: {
          invoice_url: invoiceUrl,
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
  async widthdrawRequest(req, res) {
    const { wallet_address, amount_usd } = req?.body
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

    const transactions = await founcList(WalletTransaction, req, where, { attributes: { exclude: ["meta"] } });
    this.response({ res, message: "تاریختچه کیف پول", data: transactions })


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
