const Controllers = require("../../../controllers");
const Wallet = require("../../../../models/Wallet");
const { createDepositIRR } = require("../../../../services/PeykanPayment")
const { createDepositUSDInvoice } = require("../../../../services/NOWPayments")

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
      const user = req.user; // چون قبلاً auth شده

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
};

module.exports = new Controller();
