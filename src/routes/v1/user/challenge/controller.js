const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const CouponUsage = require("../../../../models/CouponUsage");
const Coupon = require("../../../../models/Coupon");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../../../models/Challenge/ChallengePhase");
const AccountInstance = require("../../../../models/Challenge/AccountInstance");
const Payment = require("../../../../models/Payment");
const { createChFounc } = require("../../../../services/BuyCh");
const { paykanService } = require("../../../../services/PeykanPayment");
const createMTUser = require("../../../../services/BuyCh/CreateMTUser");
const generateMainPassword = require("../../../../services/BuyCh/CreatePassword");
const Order = require("../../../../models/Order");
const { createDepositUSDInvoice } = require("../../../../services/NOWPayments");
const sequelize = require("../../../../../db");

const Controller = class extends Controllers {
  async getPlansList(req, res) {
    const listTypes = await ChallengeType?.findAll({ include: [ChallengePlan] })

    this.response({
      res, status: 200, message: "اطلاعات چالش ها", data: {
        listTypes
      }
    })
  }
  async getPhase(req, res) {
    const details = await ChallengePhase?.findAll({ where: { challenge_plan_id: req?.params?.planId } })

    this.response({
      res, status: 200, message: "اطلاعات دیتیل یه چالش", data: details
    })
  }
  async buyPlan(req, res, next) {
    try {
      // 1 step (Create Challenge)
      const ch_data = await createChFounc(req, res, next)
      // 2 step (getway)
      if (req?.body?.gateway === "peykan") {
        const { redirectUrl } = await paykanService({ userId: req?.user?.id, amountUsd: ch_data?.order?.amount_usd, userChallenge: ch_data?.userChallenge?.id })

        return this.response({
          res, message: "سفارش شما ثبت شد در حال انتقال به درگاه...", data: {
            url: redirectUrl
          }
        })
      } else if (req?.body?.gateway === "nowpayments") {
        const { invoiceUrl } = await createDepositUSDInvoice({
          callback_url: "https://api.myprop.trade/api/v1/web/show-data-getway", amountUsd: ch_data?.order?.amount_usd,
          user: req?.user
        })

        return this.response({
          res, message: "سفارش شما ثبت شد در حال انتقال به درگاه...", data: {
            url: invoiceUrl
          }
        })

      }


      this.response({
        res, message: "درگاه انتخابی اشتباه است", status: 400
      })

    } catch (err) {
      console.log("Error=>>>>>>")
      console.log(err)
    }

  }
  async callbackBuyCh(req, res) {
    const t = await sequelize.transaction();
    try {
      const orderId = req?.body?.order_id;
      const rawStatus = String(req?.body?.status || "");
      const status = rawStatus.toUpperCase();

      const trackingCode = req?.body?.tracking_code || null;
      const refNum = req?.body?.ref_num || null;

      if (!orderId) {
        await t.rollback();
        return this.response({ res, status: 400, message: "order_id ارسال نشده است" });
      }

      // 1) Lock Payment
      const payment = await Payment.findOne({
        where: { order_id: orderId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!payment) {
        await t.rollback();
        return this.response({ res, status: 400, message: "تراکنشی یافت نشد" });
      }

      // idempotent: اگر قبلاً confirmed شده، هیچ کاری نکن
      if (String(payment.status).toLowerCase() === "confirmed") {
        await t.commit();
        return this.response({ res, status: 200, message: "قبلاً تایید شده است" });
      }

      if (!["pending", "waiting"].includes(String(payment.status))) {
        await t.rollback();
        return this.response({ res, status: 400, message: "وضعیت تراکنش منتظر پرداخت نیست" });
      }

      // 2) Lock Order
      const order = await Order.findOne({ where: { gateway_order_id: orderId } }, { transaction: t, lock: t.LOCK.UPDATE });
      if (!order) {
        await t.rollback();
        return this.response({ res, status: 400, message: "سفارش یافت نشد" });
      }

      // normalize payment status
      const nextPaymentStatus =
        status === "CONFIRMED" ? "confirmed" :
          status === "FAILED" ? "failed" :
            status === "CANCELED" ? "cancelled" :
              "unknown";

      await payment.update(
        { status: nextPaymentStatus, provider_payment_id: trackingCode },
        { transaction: t }
      );

      if (status !== "CONFIRMED") {
        // سفارش رو هم آپدیت کن (اختیاری)
        await order.update(
          { status: nextPaymentStatus === "failed" ? "failed" : "pending" },
          { transaction: t }
        );
        await t.commit();
        return this.response({ res, status: 400, message: "پرداخت تایید نشد" });
      }

      console.log("payment=>", payment)

      // 3) Lock UserChallenge + Plan
      const userChallenge = await UserChallenge.findByPk(payment?.UserChallenge, {
        include: [ChallengePlan],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!userChallenge) {
        await t.rollback();
        return this.response({ res, status: 400, message: "برای این پرداخت چالشی یافت نشد" });
      }

      // 4) Order paid (فقط همین order)
      await order.update(
        { status: "paid", gateway_order_id: trackingCode, gateway_payment_id: refNum, paid_at: new Date() },
        { transaction: t }
      );

      // 5) اگر قبلاً برای phase1 اکانت ساخته شده، دوباره نساز
      // (این چک + unique constraint جلوی دوباره‌کاری رو می‌گیره)
      let acc = await AccountInstance.findOne({
        where: { user_challenge_id: userChallenge.id, phase_index: 1, cycle_no: 1 },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!acc) {
        // بالانس مرحله ۱ (از پلن یا از phase override اگر بعداً اضافه کردی)
        const startingBalance = Number(userChallenge.ChallengePlan.account_size_usd);

        acc = await AccountInstance.create(
          {
            user_id: userChallenge.user_id,
            user_challenge_id: userChallenge.id,
            phase_index: 1,
            cycle_no: 1,
            platform: "mt5",
            starting_balance_usd: startingBalance,
            display_balance_usd: startingBalance,
            status: "pending",
            created_by_admin_id: null,
            rules_snapshot: userChallenge.rules_snapshot || null, // یا snapshot مخصوص phase1
          },
          { transaction: t }
        );
      }

      // 6) آپدیت وضعیت کلی چالش (پرونده)
      await userChallenge.update(
        { status: "phase1_active", current_phase_index: 1 },
        { transaction: t }
      );

      // 7) ساخت اکانت متاتریدر
      const inPassword = generateMainPassword();
      const mPassword = generateMainPassword();

      const plan = userChallenge.ChallengePlan;

      const createUserMT = await createMTUser({
        order_id: `${orderId}-${refNum || ""}`,
        balance: Number(acc.starting_balance_usd),
        emailuser: 0,

        // قوانین
        eod_role: Number(plan.max_daily_drawdown_percent),
        start_balance_role: Number(plan.max_overall_drawdown_percent),

        // ریسک شناور (طبق صحبت جدید: از روی پلن)
        eod_relative: plan.has_floating_risk ? Number(plan.floating_risk_value || 0) : 0,

        inPassword,
        mPassword,
        leverge: plan.leverage,
        groupch: "Live\\MYprop\\4-10Challenge",
      });

      if (!createUserMT?.Login) {
        await t.rollback();
        return this.response({ res, status: 500, message: "ساخت حساب متاتریدر ناموفق بود" });
      }

      // 8) ذخیره اطلاعات MT روی AccountInstance (نه UserChallenge)
      await acc.update(
        {
          mt_login: String(createUserMT.Login),
          mt_server: "Live\\MYprop\\4-10Challenge",
          mt_group: "Live\\MYprop\\4-10Challenge",
          status: "active",
          activated_at: new Date(),
          mt_password: mPassword,
          in_password: inPassword,
        },
        { transaction: t }
      );

      await t.commit();

      return this.response({
        res,
        status: 200,
        message: "اکانت مرحله اول با موفقیت ساخته شد!",
        data: {
          user_challenge_id: userChallenge.id,
          account_instance_id: acc.id,
          phase_index: acc.phase_index,
          mt_login: acc.mt_login,
          mt_server: acc.mt_server,
        },
      });
    } catch (err) {
      await t.rollback();
      return this.response({ res, status: 500, message: err?.message || "خطای سرور" });
    }
  }

};

module.exports = new Controller();
