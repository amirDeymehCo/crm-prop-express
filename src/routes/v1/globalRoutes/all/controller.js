const Controllers = require("../../../controllers");
const Order = require("../.././../../models/Order");
const Payment = require("../.././../../models/Payment");
const WalletTransaction = require("../.././../../models/WalletTransaction");
const Wallet = require("../.././../../models/Wallet");
const { verifyWithGateway } = require("../../../../services/PeykanPayment");
const sequelize = require("../../../../../db");

const baseSite = process.env.FRONT_BASE_URL;

const Controller = class extends Controllers {
  async callbackPeykan(req, res) {
    const data = Object.keys(req.body || {}).length ? req.body : req.query;

    const orderId = data.order_id;
    if (!orderId)
      return this.response({
        status: 400,
        res,
        message: "order_id نامعتبر است",
      });

    // 1) پیدا کردن سفارش/پرداخت بر اساس gateway_order_id
    const order = await Order.findOne({ where: { gateway_order_id: orderId } });
    if (!order)
      return this.response({ status: 400, res, message: "سفارشی یافت نشد" });

    const payment = await Payment.findOne({
      where: { order_id: data.order_id },
    });
    if (!payment)
      return this.response({ status: 400, res, message: "پرداختی یافت نشد" });

    // 2) اگر قبلاً پردازش شده، دوباره شارژ نکن
    if (payment.status === "paid" || order.status === "paid") {
      return res.redirect(baseSite + "/account/wallet?successPayment=true");
    }

    // 3) verify واقعی با درگاه (مهم‌ترین بخش)
    const verify = await verifyWithGateway({
      amount: order?.amount_irr,
      cardNo: data?.card_no,
      orderId: data?.order_id,
      refNum: data?.ref_num,
      trackingCode: data?.tracking_code,
    });
    // باید از API درگاه نتیجه قطعی بگیری
    if (verify?.success !== "CONFIRMED") {
      await payment.update({
        status: "failed",
        meta: JSON.stringify({ data, verify }),
      });
      await order.update({ status: "failed" });
      return res.redirect(
        baseSite + `/account/wallet?status=${verify?.status}`,
      );
    }

    // 4) مبلغ verify باید با مبلغ سفارش/پرداخت match شود (خیلی مهم)
    // اگر واحدها فرق دارن (ریال/تومان/...) اینجا normalize کن
    // if (verify.amount !== order.amount_irr) ...

    // 5) اعمال شارژ: transaction + idempotency روی tracking_code
    await sequelize.transaction(async (t) => {
      // دوباره داخل تراکنش چک کن (برای همزمانی)
      const alreadyTx = await WalletTransaction.findOne({
        where: { ref_id: verify.refNum }, // یا tracking_code
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (alreadyTx) return;

      await payment.update(
        {
          status: "paid",
          provider_payment_id: data?.tracking_code,
          meta: JSON.stringify({ data, verify }),
          paid_at: new Date(),
        },
        { transaction: t },
      );

      await order.update(
        { status: "paid", paid_at: new Date() },
        { transaction: t },
      );

      const wallet = await Wallet.findOne({
        where: { user_id: order.user_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const amountUSD = Number(payment.amount_usd);

      await WalletTransaction.create(
        {
          type: "deposit",
          amount: amountUSD,
          balance_before: wallet.balance,
          balance_after: Number(wallet.balance) + amountUSD,
          ref_id: verify.refNum,
          status: "completed",
          meta: JSON.stringify({ data, verify }),
          wallet_id: wallet.id,
        },
        { transaction: t },
      );

      wallet.balance = Number(wallet.balance) + amountUSD;
      await wallet.save({ transaction: t });
    });

    return res.redirect(baseSite + `/account/wallet?status=${verify?.status}`);
  }
};

module.exports = new Controller();
