const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const CouponUsage = require("../../../../models/CouponUsage");
const Coupon = require("../../../../models/Coupon");
const UserChallenge = require("../../../../models/UserChallenge");
const ChallengeType = require("../../../../models/ChallengeType");
const ChallengePlan = require("../../../../models/ChallengePlan");
const ChallengePhase = require("../../../../models/ChallengePhase");
const Payment = require("../../../../models/Payment");
const { createChFounc } = require("../../../../services/BuyCh");
const { paykanService } = require("../../../../services/PeykanPayment");
const createMTUser = require("../../../../services/BuyCh/CreateMTUser");
const generateMainPassword = require("../../../../services/BuyCh/CreatePassword");
const Order = require("../../../../models/Order");
const { createDepositUSDInvoice } = require("../../../../services/NOWPayments");

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
  async callbaclBuyCh(req, res) {
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

    const updatedPayment = await Payment.findOne({
      where: { order_id: req?.body?.order_id }
    });
    // if success payemnt 
    if (req?.body?.status === "CONFIRMED" && updatedPayment) {
      const userChallenge = await UserChallenge.findByPk(updatedPayment?.UserChallenge, { include: [ChallengePlan] })
      if (!userChallenge) return this.response({ res, status: 400, message: "با این شناسه پرداخت برای کاربری چالش ثبت نشده است" })
      // update order 
      await Order.update({ status: "paid", gateway_order_id: req?.body?.tracking_code, gateway_payment_id: req?.body?.ref_num, paid_at: new Date() }, { where: { user_challenge_id: userChallenge?.id } })

      // create meta trade user 
      const inPassword = generateMainPassword();
      const mPassword = generateMainPassword();

      const createUserMT = await createMTUser({
        order_id: req?.body?.order_id + req?.body?.ref_num,
        balance: Number(userChallenge?.ChallengePlan?.account_size_usd),
        emailuser: 0,
        eod_role: Number(userChallenge?.ChallengePlan?.max_daily_drawdown_percent),
        start_balance_role: Number(userChallenge?.ChallengePlan?.max_overall_drawdown_percent),
        eod_relative: Number(userChallenge?.ChallengePlan?.eod_relative?.floating_risk_value || 0),
        inPassword,
        mPassword,
        leverge: userChallenge?.ChallengePlan?.leverage,
        groupch: "Live\\MYprop\\4-10Challenge"
      });


      // update user challenge 
      const updatedChData = {
        status: "active",
        mt_login: createUserMT?.Login,
        mt_password: inPassword,
        in_password: mPassword,
        mt_server: "Live\\MYprop\\4-10Challenge"
      }
      await UserChallenge.update(updatedChData, { where: { id: updatedPayment?.UserChallenge }, })

      this.response({ res, status: 200, message: "کاربر مای پراپ حساب شما با موفقیت ساخته شد!", data: updatedChData })
      return
    }

    this.response({ res, status: 400, message: "پرداخت ثبت نشد" })
  }
};

module.exports = new Controller();
