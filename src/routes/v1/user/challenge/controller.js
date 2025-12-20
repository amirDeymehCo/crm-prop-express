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
const RequestChnageStatus = require("../../../../models/RequestChangeStatus");
const founcList = require("../../../../utils/List");
const { Op } = require("sequelize");

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

      const orderId = ch_data?.order?.gateway_order_id;
      const amountUsd = Number(ch_data?.order?.amount_usd || 0);



      if (!orderId) {
        await t.rollback();
        return this.response({ res, status: 400, message: "شناسه سفارش ساخته نشد" });
      }

      // ✅ 2) اگر چالش رایگان است (final_price = 0) -> هیچ درگاهی نرو
      if (amountUsd === 0) {
        console.log("orderId=", orderId)
        const result = await finalizeChallengeAfterPaid({
          user: req?.user,
          orderId,
          trackingCode: `COUPON-FREE-${Date.now()}`,
          refNum: null,
          t,
        });

        console.log("result=>", result)
        await t.commit();

        return this.response({
          res,
          status: 200,
          message: "چالش با کد تخفیف رایگان شد و اکانت مرحله اول ساخته شد",
          data: {
            user_challenge_id: result.userChallenge.id,
            account_instance_id: result.acc.id,
            mt_login: result.acc.mt_login,
            mt_server: result.acc.mt_server,
          },
        });
      }

      // ✅ 3) مسیر ولت
      if (req?.body?.gateway === "wallet") {
        await payWithWallet({
          userId: req.user.id,
          orderId,
          amountUsd,
          t,
        });

        const result = await finalizeChallengeAfterPaid({
          user: req?.user,
          orderId,
          trackingCode: `WALLET-${Date.now()}`,
          refNum: null,
          t,
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
          },
        });
      }

      // 4) مسیر درگاه‌ها (نیازی به finalize اینجا نیست)
      await t.commit();

      if (req?.body?.gateway === "peykan") {
        const { redirectUrl } = await paykanService({
          userId: req?.user?.id,
          amountUsd,
          userChallenge: ch_data?.userChallenge?.id,
        });

        return this.response({
          res,
          message: "سفارش شما ثبت شد در حال انتقال به درگاه...",
          data: { url: redirectUrl },
        });
      }

      if (req?.body?.gateway === "nowpayments") {
        const { invoiceUrl } = await createDepositUSDInvoice({
          callback_url: "https://api.myprop.trade/api/v1/web/show-data-getway",
          amountUsd,
          user: req?.user,
        });

        return this.response({
          res,
          message: "سفارش شما ثبت شد در حال انتقال به درگاه...",
          data: { url: invoiceUrl },
        });
      }

      return this.response({ res, message: "درگاه انتخابی اشتباه است", status: 400 });
    } catch (err) {
      console.log(err)
      await t.rollback();
      return this.response({
        res,
        status: err.status || 500,
        message: err.message || "خطای سرور",
      });
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
        await t.commit();
        return this.response({ res, status: 400, message: "پرداخت تایید نشد" });
      }

      console.log("req?.user=>", req?.user)

      // پرداخت موفق => finalize مشترک
      const result = await finalizeChallengeAfterPaid({
        user: req?.user,
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
  async requestChangeStatus(req, res) {
    const findReq = await RequestChnageStatus.findOne({ where: { user_challenge_id: req?.body?.user_challenge_id, status: "pending" } });
    if (findReq) return this.response({ res, status: 400, message: "کاربر مای پراپ، شما قبلا برای این چالش درخواست ثبت کرده اید" })


    await RequestChnageStatus.create({
      user_id: req?.user?.id,
      user_challenge_id: req?.body?.user_challenge_id,
      status: "pending"
    })

    this.response({ res, status: 201, message: "کاربر مای پراپ، درخواست تغییر مرحله شما با موفقیت ثبت شد" })
  }
  async userChallenges(req, res) {
    const { query } = req
    const where = {
      user_id: req?.user?.id,
    };

    if (query.challenge_plan_id) {
      where.challenge_plan_id = query.challenge_plan_id;
    }
    if (query.platform) {
      where.platform = query.platform;
    }
    if (query.current_phase_index) {
      where.current_phase_index = query.current_phase_index;
    }
    if (query.status) {
      where.status = query.status;
    }

    const list = await founcList(UserChallenge, req, where, {
      include: [{
        model: ChallengePlan, attributes: ["id", "balance", "floating_risk_type", "allow_insurance"],
        include: [{
          model: ChallengeType
        }]
      }, {
        model: AccountInstance,
        attributes: ["id", "platform", "phase_index", "mt_login", "mt_group", "in_password", "mt_password", "starting_balance_usd", "rules_snapshot", "status"]
      }],
      attributes: ["id", "status", "current_phase_index", "price_usd", "createdAt", "updatedAt"]
    })

    this.response({ res, message: "لیست چالش های کاربر", data: list })
  }
  async singleChallenge(req, res) {
    const singleCh = await UserChallenge?.findByPk(req?.params?.id, {
      include: [{
        model: ChallengePlan,
        include: [ChallengeType]
      },
        AccountInstance
      ],
      attributes: ["id", "status", "current_phase_index", "price_usd", "createdAt", "updatedAt"]
    })

    if (!singleCh) return this.response({ res, status: 400, message: "کاربر مای پراپ، چالشی با این شناسه یافت نشد لطفا دوباره امتحان کنید" });

    this.response({ res, status: 200, message: "اطلاعات چالش", data: singleCh })
  }
};

module.exports = new Controller();
