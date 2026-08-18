const Controllers = require("../../../controllers");
const Order = require("../.././../../models/Order");
const User = require("../.././../../models/User");
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
const { getSessionStatus } = require("../../../../services/IsLoginedUser");
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
        where: { ref_id: data.ref_num }, // یا tracking_code
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
        {
          status: "paid",
          paid_at: new Date(),
          gateway_payment_id: data?.ref_num,
        },
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
          ref_id: data.ref_num,
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
    try {
      const data = Object.keys(req.body || {}).length ? req.body : req.query;

      const orderId = data?.order_id;
      const statusRaw = data?.status;
      const trackingCode = data?.tracking_code || null;
      const refNum = data?.ref_num || null;

      if (!orderId) {
        return this.response({
          res,
          status: 400,
          message: "order_id ارسال نشده است",
        });
      }

      // ==========================================
      // 1. پیدا کردن Order - بدون transaction
      // ==========================================

      const order = await Order.findOne({
        where: {
          gateway_order_id: orderId,
        },
      });

      if (!order) {
        return this.response({
          res,
          status: 400,
          message: "سفارشی یافت نشد",
        });
      }

      // ==========================================
      // 2. پیدا کردن Payment - بدون transaction
      // ==========================================

      const payment = await Payment.findOne({
        where: {
          order_id: orderId,
        },
      });

      if (!payment) {
        return this.response({
          res,
          status: 400,
          message: "پرداختی یافت نشد",
        });
      }

      // ==========================================
      // 3. اگر قبلاً پرداخت شده
      // ==========================================

      if (order.status === "paid" || payment.status === "paid") {
        return this.response({
          res,
          status: 200,
          message: "پرداخت قبلاً تایید شده است",
        });
      }

      // ==========================================
      // 4. Verify درگاه
      // بدون transaction
      // ==========================================

      const verify = await verifyWithGateway({
        amount: order.amount_irr,
        cardNo: data?.card_no,
        orderId,
        refNum,
        trackingCode,
      });

      const normalizedStatus = normalizeGatewayStatus(
        verify?.status || statusRaw,
      );

      // ==========================================
      // 5. پرداخت ناموفق
      // ==========================================

      if (normalizedStatus !== "confirmed") {
        await sequelize.transaction(async (t) => {
          await Payment.update(
            {
              status: "failed",
              meta: JSON.stringify({
                data,
                verify,
              }),
            },
            {
              where: {
                id: payment.id,
              },
              transaction: t,
            },
          );

          await Order.update(
            {
              status: "failed",
              meta: JSON.stringify({
                data,
                verify,
              }),
            },
            {
              where: {
                id: order.id,
              },
              transaction: t,
            },
          );
        });

        return res.redirect(
          baseSite + `/account/challenges?status=${verify?.status}`,
        );
      }

      console.log("START SUCCESS __ 1");

      // ==========================================
      // 6. پرداخت موفق
      // فقط اینجا transaction
      // ==========================================

      await sequelize.transaction(async (t) => {
        // --------------------------------------
        // Lock Order
        // --------------------------------------

        const lockedOrder = await Order.findOne({
          where: {
            id: order.id,
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!lockedOrder) {
          const err = new Error("سفارش یافت نشد");
          err.status = 400;
          throw err;
        }

        console.log("START SUCCESS __ 2");

        // --------------------------------------
        // دوباره بررسی کن
        // چون ممکنه callback همزمان آمده باشد
        // --------------------------------------

        if (lockedOrder.status === "paid") {
          return;
        }

        // --------------------------------------
        // Lock Payment
        // --------------------------------------

        console.log("START SUCCESS __ 3");

        const lockedPayment = await Payment.findOne({
          where: {
            id: payment.id,
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        console.log("START SUCCESS __ 4");

        if (!lockedPayment) {
          const err = new Error("پرداخت یافت نشد");
          err.status = 400;
          throw err;
        }

        if (lockedPayment.status === "paid") {
          return;
        }

        console.log("START SUCCESS __ 5");

        // --------------------------------------
        // User
        // --------------------------------------

        const user = await User.findByPk(lockedOrder.user_id, {
          transaction: t,
        });

        console.log("START SUCCESS __ 6");

        if (!user) {
          const err = new Error("کاربر یافت نشد");
          err.status = 404;
          throw err;
        }

        console.log("START SUCCESS __ 7");

        // --------------------------------------
        // Finalize
        // --------------------------------------

        await finalizeChallengeAfterPaid({
          user,
          orderId,
          trackingCode,
          refNum,
          t,
          platform: "ctrader",
        });

        console.log("START SUCCESS __ 8");

        // --------------------------------------
        // Payment
        // --------------------------------------

        await lockedPayment.update(
          {
            status: "paid",
            provider_payment_id: trackingCode,
            paid_at: new Date(),
            meta: JSON.stringify({
              data,
              verify,
            }),
          },
          {
            transaction: t,
          },
        );

        console.log("START SUCCESS __ 9");

        // --------------------------------------
        // Order
        // --------------------------------------

        await lockedOrder.update(
          {
            status: "paid",
            paid_at: new Date(),
          },
          {
            transaction: t,
          },
        );
      });

      // ==========================================
      // 7. Response
      // ==========================================

      return res.redirect(
        baseSite + `/account/challenges?status=${verify?.status}`,
      );
    } catch (err) {
      console.error("callbackBuyCh ERROR:", err);

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

    console.log("AMIR=>>>>>>>");
    console.log(setting);

    this.response({
      res,
      status: 200,
      message: "اطلاعات چالش ها",
      data: {
        listTypes,
        dollar_price:
          Number(setting?.dollar_price) + Number(setting?.bonus_dollar),
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
  async isLogined(req, res) {
    const result = await getSessionStatus(req.body || {});

    this.response({ res, data: result });
  }
};

module.exports = new Controller();
