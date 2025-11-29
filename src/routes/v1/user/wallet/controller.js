const Controllers = require("../../../controllers");
const { createDepositIRR } = require("../../../../services/PeykanPayment")
const { createDepositUSDInvoice, handleIpnCallback } = require("../../../../services/NOWPayments")
const Wallet = require("../../../../models/Wallet")
const WidthdrawRequest = require("../../../../models/WidthdrawRequest")

const Controller = class extends Controllers {
  async depositIRR(req, res) {
    try {
      const userId = req?.user?.id;
      const { amount_usd } = req.body;

      if (!amount_usd || Number(amount_usd) <= 0) {
        return res.status(400).json({ message: "لطفا مبلغ را درست وارد کنید" });
      }
      const { redirectUrl } = await createDepositIRR({
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
  async callbackPaykan(req, res) {
    this.response({ res, status: 200, message: "این پیام کالبک هست Get" })
  }
  async callbackPaykanPost(req, res) {
    this.response({ res, status: 200, message: "این پیام کالبک هست Post" })
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
};

module.exports = new Controller();
