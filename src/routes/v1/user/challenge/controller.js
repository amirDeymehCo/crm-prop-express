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
const { payWithWallet } = require("../../../../services/BuyCh/WalletPay");
const { finalizeChallengeAfterPaid } = require("../../../../services/ChallengeFinalize");
const sequelize = require("../../../../../db");
const { normalizeGatewayStatus } = require("../../../../helpers/paymentsStatus");

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
    const t = await sequelize.transaction();
    try {
      // 1) ساخت چالش + ساخت order + payment (همون createChFounc خودت)
      const ch_data = await createChFounc(req, res, next, t);
      // پیشنهاد: createChFounc رو طوری کن که transaction بگیره و همه چیز داخل همون t ساخته بشه

      const orderId = ch_data?.order?.gateway_order_id;
      // یا هر چیزی که به عنوان order_id به درگاه میدی (تو callback با order_id کار می‌کنی)
      console.log("ch_data=>", orderId)
      // 2) مسیر ولت
      if (req?.body?.gateway === "wallet") {
        await payWithWallet({
          userId: req.user.id,
          orderId,
          amountUsd: ch_data?.order?.amount_usd,
          t
        });

        // 3) چون ولت پول رو همینجا کم کرد، همون لحظه finalize انجام بده
        const result = await finalizeChallengeAfterPaid({
          orderId,
          trackingCode: `WALLET-${Date.now()}`,
          refNum: null,
          t
        });

        await t.commit();

        return this.response({
          res,
          status: 200,
          message: "خرید با ولت موفق بود و اکانت مرحله اول ساخته شد",
          data: {
            user_challenge_id: result.userChallenge.id,
            account_instance_id: result.acc.id,
            mt_login: result.acc.mt_login,
            mt_server: result.acc.mt_server,
          }
        });
      }

      // 4) مسیر درگاه‌ها مثل قبل (بدون finalize اینجا)
      await t.commit();

      if (req?.body?.gateway === "peykan") {
        const { redirectUrl } = await paykanService({
          userId: req?.user?.id,
          amountUsd: ch_data?.order?.amount_usd,
          userChallenge: ch_data?.userChallenge?.id
        });

        return this.response({
          res,
          message: "سفارش شما ثبت شد در حال انتقال به درگاه...",
          data: { url: redirectUrl }
        });
      }

      if (req?.body?.gateway === "nowpayments") {
        const { invoiceUrl } = await createDepositUSDInvoice({
          callback_url: "https://api.myprop.trade/api/v1/web/show-data-getway",
          amountUsd: ch_data?.order?.amount_usd,
          user: req?.user
        });

        return this.response({
          res,
          message: "سفارش شما ثبت شد در حال انتقال به درگاه...",
          data: { url: invoiceUrl }
        });
      }

      return this.response({ res, message: "درگاه انتخابی اشتباه است", status: 400 });

    } catch (err) {
      await t.rollback();
      return this.response({ res, status: err.status || 500, message: err.message || "خطای سرور" });
    }
  }


  async callbackBuyCh(req, res) {
    const t = await sequelize.transaction();
    try {
      const orderId = req?.body?.order_id;
      const status = normalizeGatewayStatus(req?.body?.status);
      const trackingCode = req?.body?.tracking_code || null;
      const refNum = req?.body?.ref_num || null;

      if (!orderId) {
        await t.rollback();
        return this.response({ res, status: 400, message: "order_id ارسال نشده است" });
      }

      // اگر پرداخت تایید نشد، فقط payment/order رو آپدیت کن و تمام
      if (status !== "confirmed") {
        // همون لاجیک آپدیت payment/order که داشتی، سبک‌ترش کن
        // ...
        await t.commit();
        return this.response({ res, status: 400, message: "پرداخت تایید نشد" });
      }

      // پرداخت موفق => finalize مشترک
      const result = await finalizeChallengeAfterPaid({
        orderId,
        trackingCode,
        refNum,
        t
      });

      await t.commit();

      return this.response({
        res,
        status: 200,
        message: result.alreadyDone ? "قبلاً تایید شده است" : "اکانت مرحله اول با موفقیت ساخته شد!",
        data: result.alreadyDone ? null : {
          user_challenge_id: result.userChallenge.id,
          account_instance_id: result.acc.id,
          phase_index: result.acc.phase_index,
          mt_login: result.acc.mt_login,
          mt_server: result.acc.mt_server,
        },
      });

    } catch (err) {
      await t.rollback();
      return this.response({ res, status: err.status || 500, message: err?.message || "خطای سرور" });
    }
  }
};

module.exports = new Controller();
