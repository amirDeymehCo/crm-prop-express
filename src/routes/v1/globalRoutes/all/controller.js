const Controllers = require("../../../controllers");
const Order = require("../.././../../models/Order");
const Payment = require("../.././../../models/Payment");
const WalletTransaction = require("../.././../../models/WalletTransaction");
const Wallet = require("../.././../../models/Wallet");
const Setting = require("../.././../../models/Setting");
const ChallengeType = require("../.././../../models/Challenge/ChallengeType");
const ChallengePlan = require("../.././../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../.././../../models/Challenge/ChallengePhase");
const { verifyWithGateway } = require("../../../../services/PeykanPayment");
const sequelize = require("../../../../../db");
const {
  normalizeGatewayStatus,
} = require("../../../../helpers/paymentsStatus");
const {
  finalizeChallengeAfterPaid,
} = require("../../../../services/ChallengeFinalize");
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
    if (verify?.status !== "CONFIRMED") {
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

      wallet.balance = Number(wallet.balance) + Number(amountUSD);
      await wallet.save({ transaction: t });
    });

    return res.redirect(baseSite + `/account/wallet?status=${verify?.status}`);
  }
  async callbackBuyCh(req, res) {
    const t = await sequelize.transaction();
    try {
      const data = Object.keys(req.body || {}).length ? req.body : req.query;
      const orderId = data?.order_id;
      const statusRaw = data?.status;
      const trackingCode = data?.tracking_code || null;
      const refNum = data?.ref_num || null;

      if (!orderId) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "order_id ارسال نشده است",
        });
      }

      /** 🧩 پیدا کردن order و payment بر اساس درگاه */
      const order = await Order.findOne({
        where: { gateway_order_id: orderId },
        transaction: t,
      });
      if (!order) {
        await t.rollback();
        return this.response({ res, status: 400, message: "سفارشی یافت نشد" });
      }

      const payment = await Payment.findOne({
        where: { order_id: data?.order_id },
        transaction: t,
      });
      if (!payment) {
        await t.rollback();
        return this.response({ res, status: 400, message: "پرداختی یافت نشد" });
      }

      /** 🧠 اگر قبلاً تأیید شده بود */
      if (order?.status === "paid" || payment?.status === "paid") {
        await t.commit();
        return this.response({
          res,
          status: 200,
          message: "پرداخت قبلاً تایید شده است",
        });
      }

      /** ✅ تایید واقعی از سمت درگاه */
      const verify = await verifyWithGateway({
        amount: order?.amount_irr,
        cardNo: data?.card_no,
        orderId: data?.order_id,
        refNum: refNum,
        trackingCode: trackingCode,
      });

      const normalizedStatus = normalizeGatewayStatus(
        verify?.status || statusRaw,
      );

      // اگر پرداخت تایید نشده
      if (normalizedStatus !== "confirmed") {
        await payment.update(
          {
            status: "failed",
            meta: JSON.stringify({ data, verify }),
          },
          { transaction: t },
        );
        await order.update(
          {
            status: "failed",
            meta: JSON.stringify({ data, verify }),
          },
          { transaction: t },
        );

        await t.commit();
        return res.redirect(
          baseSite + `/account/challenges?status=${verify?.status}`,
        );
      }

      /** ✅ تایید موفق => finalize چالش */
      const finalizeResult = await finalizeChallengeAfterPaid({
        user: req?.user,
        orderId,
        trackingCode,
        refNum,
        t,
      });

      /** بروزرسانی وضعیت پرداخت/سفارش */
      await payment.update(
        {
          status: "paid",
          provider_payment_id: trackingCode,
          paid_at: new Date(),
          meta: JSON.stringify({ data, verify }),
        },
        { transaction: t },
      );

      await order.update(
        {
          status: "paid",
          paid_at: new Date(),
        },
        { transaction: t },
      );

      await t.commit();

      return res.redirect(
        baseSite + `/account/challenges?status=${verify?.status}`,
      );

      // return this.response({
      //   res,
      //   status: 200,
      //   message: finalizeResult.alreadyDone
      //     ? "پرداخت قبلاً تایید شده بود"
      //     : "اکانت مرحله اول با موفقیت ساخته شد!",
      //   data: finalizeResult.alreadyDone
      //     ? null
      //     : {
      //         user_challenge_id: finalizeResult.userChallenge.id,
      //         account_instance_id: finalizeResult.acc.id,
      //         phase_index: finalizeResult.acc.phase_index,
      //         mt_login: finalizeResult.acc.mt_login,
      //         mt_server: finalizeResult.acc.mt_server,
      //       },
      // });
    } catch (err) {
      // await t.rollback();
      return this.response({
        res,
        status: err.status || 500,
        message: err?.message || "خطای سرور در پردازش پرداخت",
      });
    }
  }
  async getPlansList(req, res) {
    const setting = await Setting.findByPk(1);
    const listTypes = await ChallengeType?.findAll({
      include: [
        {
          model: ChallengePlan,
        },
      ],
    });

    listTypes.forEach((type) => {
      if (Array.isArray(type?.ChallengePlans)) {
        type?.ChallengePlan?.sort((a, b) => {
          return a.balance - b.balance; // ASC
        });
      }
    });

    this.response({
      res,
      status: 200,
      message: "اطلاعات چالش ها",
      data: {
        listTypes,
        dollar_price: setting?.dollar_price,
      },
    });
  }
  async getPhase(req, res) {
    const where = { challenge_plan_id: req?.params?.planId };
    if (req?.query?.platform) where.platform = req?.query?.platform;

    const details = await ChallengePhase?.findAll({
      where,
    });

    this.response({
      res,
      status: 200,
      message: "اطلاعات دیتیل یه چالش",
      data: details,
    });
  }
};

module.exports = new Controller();
