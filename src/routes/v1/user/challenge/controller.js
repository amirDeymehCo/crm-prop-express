const Controllers = require("../../../controllers");
const CouponUsage = require("../../../../models/CouponUsage");
const Coupon = require("../../../../models/Coupon");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../../../models/Challenge/ChallengePhase");
const AccountInstance = require("../../../../models/Challenge/AccountInstance");
const { createChFounc } = require("../../../../services/BuyCh");
const { paykanService } = require("../../../../services/PeykanPayment");
const Setting = require("../../../../models/Setting");
const Admin = require("../../../../models/Admin");
const User = require("../../../../models/User");
const { createDepositUSDInvoice } = require("../../../../services/NOWPayments");
const { payWithWallet } = require("../../../../services/BuyCh/WalletPay");
const {
  finalizeChallengeAfterPaid,
} = require("../../../../services/ChallengeFinalize");
const sequelize = require("../../../../../db");
const {
  normalizeGatewayStatus,
} = require("../../../../helpers/paymentsStatus");
const RequestChnageStatus = require("../../../../models/RequestChangeStatus");
const Order = require("../../../../models/Order");
const founcList = require("../../../../utils/List");
const { Op } = require("sequelize");
const {
  fetchFullAccountAnalysis,
} = require("../../../..//services/AnalysisUser/accountAnalysisService");

const Controller = class extends Controllers {
  async getPlansList(req, res) {
    const setting = await Setting.findByPk(1);
    const listTypes = await ChallengeType?.findAll({
      include: [{ model: ChallengePlan }],
      order: [[{ model: ChallengePlan }, "balance", "ASC"]],
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
    const details = await ChallengePhase?.findAll({
      where: { challenge_plan_id: req?.params?.planId },
    });

    this.response({
      res,
      status: 200,
      message: "اطلاعات دیتیل یه چالش",
      data: details,
    });
  }
  async buyPlan(req, res, next) {
    const t = await sequelize.transaction();
    try {
      // 1) ساخت چالش + ساخت order + payment (همون createChFounc خودت)
      const ch_data = await createChFounc(req, res, next, t);

      const orderId = ch_data?.order?.gateway_order_id;
      const amountUsd = Number(ch_data?.order?.amount_usd || 0);
      // const amountUsd = 0.1

      if (!orderId) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "شناسه سفارش ساخته نشد",
        });
      }

      // ✅ 2) اگر چالش رایگان است (final_price = 0) -> هیچ درگاهی نرو
      if (amountUsd === 0) {
        const result = await finalizeChallengeAfterPaid({
          user: req?.user,
          orderId,
          trackingCode: `COUPON-FREE-${Date.now()}`,
          refNum: null,
          t,
        });

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
          callback_url:
            "https://api-crm.myprop.trade/api/v1/global/callback-peykan-challenge",
        });

        return this.response({
          res,
          message: "سفارش شما ثبت شد در حال انتقال به درگاه...",
          data: { url: redirectUrl },
        });
      }

      if (req?.body?.gateway === "nowpayments") {
        const { invoiceUrl } = await createDepositUSDInvoice({
          // callback_url:
          //   "https://api-crm.myprop.trade/api/v1/user/challenge/buy-challenge-callback",
          amountUsd,
          user: req?.user,
        });

        return this.response({
          res,
          message: "سفارش شما ثبت شد در حال انتقال به درگاه...",
          data: { url: invoiceUrl },
        });
      }

      return this.response({
        res,
        message: "درگاه انتخابی اشتباه است",
        status: 400,
      });
    } catch (err) {
      console.log(err);
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
        return this.response({
          res,
          status: 400,
          message: "order_id ارسال نشده است",
        });
      }

      // اگر پرداخت تایید نشد، فقط payment/order رو آپدیت کن و تمام
      if (status !== "confirmed") {
        await t.commit();
        return this.response({ res, status: 400, message: "پرداخت تایید نشد" });
      }

      // پرداخت موفق => finalize مشترک
      const result = await finalizeChallengeAfterPaid({
        user: req?.user,
        orderId,
        trackingCode,
        refNum,
        t,
      });

      await t.commit();

      return this.response({
        res,
        status: 200,
        message: result.alreadyDone
          ? "قبلاً تایید شده است"
          : "اکانت مرحله اول با موفقیت ساخته شد!",
        data: result.alreadyDone
          ? null
          : {
              user_challenge_id: result.userChallenge.id,
              account_instance_id: result.acc.id,
              phase_index: result.acc.phase_index,
              mt_login: result.acc.mt_login,
              mt_server: result.acc.mt_server,
            },
      });
    } catch (err) {
      await t.rollback();
      return this.response({
        res,
        status: err.status || 500,
        message: err?.message || "خطای سرور",
      });
    }
  }
  async requestChangeStatus(req, res) {
    const findReq = await RequestChnageStatus.findOne({
      where: {
        user_challenge_id: req?.body?.user_challenge_id,
        status: "pending",
      },
    });
    if (findReq)
      return this.response({
        res,
        status: 400,
        message: "کاربر مای پراپ، شما قبلا برای این چالش درخواست ثبت کرده اید",
      });

    await RequestChnageStatus.create({
      user_id: req?.user?.id,
      user_challenge_id: req?.body?.user_challenge_id,
      status: "pending",
    });

    this.response({
      res,
      status: 201,
      message: "کاربر مای پراپ، درخواست تغییر مرحله شما با موفقیت ثبت شد",
    });
  }
  async userChallenges(req, res) {
    const { query } = req;
    const where = {
      user_id: req?.user?.id,
    };

    if (query.challenge_plan_id) {
      where.challenge_plan_id = query.challenge_plan_id;
    }
    if (query.platform) {
      where.platform = query.platform;
    }
    if (query.type) {
      where.challenge_type_id = query.type;
    }
    if (query.current_phase_index) {
      where.current_phase_index = query.current_phase_index;
    }
    if (query.status) {
      where.status = query.status;
    }

    const list = await founcList(UserChallenge, req, where, {
      include: [
        {
          model: ChallengePlan,
          attributes: [
            "id",
            "title",
            "balance",
            "floating_risk_type",
            "allow_insurance",
          ],
          include: [
            {
              model: ChallengeType,
            },
          ],
        },
        {
          model: AccountInstance,
          attributes: [
            "id",
            "platform",
            "phase_index",
            "mt_login",
            "mt_group",
            "in_password",
            "mt_password",
            "starting_balance_usd",
            "status",
          ],
        },
      ],
      attributes: [
        "id",
        "status",
        "current_phase_index",
        "price_usd",
        "floating_risk_enabled",
        "has_insurance",
        "createdAt",
        "updatedAt",
      ],
    });

    this.response({ res, message: "لیست چالش های کاربر", data: list });
  }
  async singleChallenge(req, res) {
    const singleCh = await UserChallenge?.findOne({
      where: { id: req?.params?.id, user_id: req?.user?.id },
      include: [
        {
          model: ChallengePlan,
          include: [ChallengeType, ChallengePhase],
        },
        {
          model: User,
          attributes: [
            "id",
            "firstname",
            "lastname",
            "avatar",
            "mobile",
            "createdAt",
          ],
        },
        {
          model: AccountInstance,
          include: [
            {
              model: Admin,
              as: "created_by_admin",
              attributes: ["id", "name", "avatar"],
            },
          ],
        },
      ],
    });

    if (!singleCh)
      return this.response({
        res,
        status: 400,
        message:
          "کاربر مای پراپ، چالشی با این شناسه یافت نشد لطفا دوباره امتحان کنید",
      });

    this.response({
      res,
      status: 200,
      message: "اطلاعات چالش",
      data: singleCh,
    });
  }
  async checkCopun(req, res) {
    try {
      const userId = req?.user?.id;
      const { code, base_amount_usd, challenge_type_id, challenge_plan_id } =
        req.body || {};

      const cleanCode = String(code || "")
        .trim()
        .toUpperCase();
      const baseUSD = Number(base_amount_usd);

      if (!cleanCode) {
        return res
          .status(400)
          .json({ ok: false, message: "کد تخفیف وارد نشده است." });
      }
      if (baseUSD <= 0) {
        return res
          .status(400)
          .json({ ok: false, message: "مبلغ پایه معتبر نیست." });
      }

      const now = new Date();

      // کوپن را پیدا کن
      const coupon = await Coupon.findOne({
        where: {
          code: cleanCode,
          is_active: true,
          [Op.and]: [
            {
              [Op.or]: [
                { valid_from: null },
                { valid_from: { [Op.lte]: now } },
              ],
            },
            {
              [Op.or]: [{ valid_to: null }, { valid_to: { [Op.gte]: now } }],
            },
          ],
        },
      });

      if (!coupon) {
        return res.status(400).json({
          ok: false,
          message: "کد تخفیف معتبر نیست یا منقضی شده است.",
        });
      }

      // محدودیت روی نوع چالش/پلن
      if (
        coupon.challenge_type_id &&
        Number(challenge_type_id) !== Number(coupon.challenge_type_id)
      ) {
        return res.status(400).json({
          ok: false,
          message: "این کد برای این نوع چالش قابل استفاده نیست.",
        });
      }
      if (
        coupon.challenge_plan_id &&
        Number(challenge_plan_id) !== Number(coupon.challenge_plan_id)
      ) {
        return res.status(400).json({
          ok: false,
          message: "این کد برای این پلن قابل استفاده نیست.",
        });
      }

      // حداقل مبلغ سفارش
      if (coupon.min_order_amount_usd != null) {
        const minUSD = Number(coupon.min_order_amount_usd);
        if (baseUSD < minUSD) {
          return res.status(400).json({
            ok: false,
            message: `حداقل مبلغ سفارش برای این کد ${Math.round(minUSD)} دلار است.`,
          });
        }
      }

      // سقف استفاده کلی
      if (coupon.max_uses != null) {
        if (Number(coupon.used_count) >= Number(coupon.max_uses)) {
          return res
            .status(400)
            .json({ ok: false, message: "سقف استفاده این کد تکمیل شده است." });
        }
      }

      // سقف استفاده برای هر کاربر
      let userUsageCount = 0;
      if (coupon.max_uses_per_user != null) {
        if (!userId) {
          return res.status(400).json({
            ok: false,
            message: "برای استفاده از کد تخفیف باید وارد حساب شوید.",
          });
        }

        const usage = await CouponUsage.findOne({
          where: { coupon_id: coupon.id, user_id: userId },
        });

        userUsageCount = Number(usage?.used_count);
        if (userUsageCount >= Number(coupon.max_uses_per_user)) {
          return res.status(400).json({
            ok: false,
            message: "سقف استفاده شما از این کد تکمیل شده است.",
          });
        }
      }

      function calcDiscountUSD(coupon, baseUSD) {
        const base = Math.round(baseUSD);
        if (base <= 0) return { discountUSD: 0, finalUSD: 0 };

        const type = String(coupon.type).toLowerCase();

        let discount = 0;
        if (type === "percent") {
          // value مثل 70 یعنی 70%
          const pct = Number(coupon.value);
          discount = base * (pct / 100);
        } else if (type === "fixed") {
          discount = Number(coupon.value);
        }

        // تخفیف نباید از مبلغ پایه بیشتر بشه
        discount = Math.min(Math.round(discount), base);
        const finalUSD = Math.round(base - discount);

        return { discountUSD: discount, finalUSD };
      }
      // محاسبه تخفیف
      const { discountUSD, finalUSD } = calcDiscountUSD(coupon, baseUSD);

      if (discountUSD <= 0) {
        return res.status(400).json({
          ok: false,
          message: "این کد تخفیف برای این مبلغ کاربردی ندارد.",
        });
      }

      const setting = await Setting.findByPk(1);

      return res.json({
        ok: true,
        message: "کد تخفیف معتبر است.",
        data: {
          coupon: {
            id: coupon.id,
            code: coupon.code,
            type: coupon.type,
            value: String(coupon.value),
          },
          base_amount_usd: Math.round(baseUSD),
          discount_amount_usd: discountUSD,
          final_amount_usd: finalUSD,
          final_amount_irr: Number(finalUSD) * Number(setting?.dollar_price),
          user_used_count: userUsageCount,
        },
      });
    } catch (err) {
      console.error("validateCoupon error:", err);
      return res
        .status(500)
        .json({ ok: false, message: "خطای سرور در بررسی کد تخفیف." });
    }
  }
  async payPendingChallenge(req, res, next) {
    const t = await sequelize.transaction();
    try {
      const { user_challenge_id, gateway } = req.body;

      // 1) گرفتن چالش
      const userChallenge = await UserChallenge.findOne({
        where: {
          id: user_challenge_id,
          user_id: req.user.id,
          status: {
            [Op.in]: ["pending_payment", "pending"],
          },
        },
        include: [{ model: Order }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!userChallenge) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "چالش قابل پرداختی پیدا نشد",
        });
      }

      const orders = userChallenge.Orders || [];

      if (!orders.length) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "هیچ سفارشی برای این چالش یافت نشد",
        });
      }

      // آخرین سفارش هنوز پرداخت‌نشده (pending)
      const order = orders
        .filter((o) => o.status === "pending")
        .sort((a, b) => b.id - a.id)[0]; // آخرین سفارش

      if (!order) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "سفارشی برای پرداخت فعال وجود ندارد",
        });
      }

      const orderId = order.gateway_order_id;
      const amountUsd = Number(order.amount_usd || 0);
      // 2) اگر رایگان
      if (amountUsd === 0) {
        const result = await finalizeChallengeAfterPaid({
          user: req.user,
          orderId,
          trackingCode: `FREE-${Date.now()}`,
          refNum: null,
          t,
        });

        await t.commit();

        return this.response({
          res,
          message: "چالش با موفقیت فعال شد",
          data: {
            user_challenge_id: result.userChallenge.id,
            account_instance_id: result.acc.id,
          },
        });
      }

      // 3) پرداخت با ولت
      if (gateway === "wallet") {
        await payWithWallet({
          userId: req.user.id,
          orderId,
          amountUsd,
          t,
        });

        const result = await finalizeChallengeAfterPaid({
          user: req.user,
          orderId,
          trackingCode: `WALLET-${Date.now()}`,
          refNum: null,
          t,
        });

        await t.commit();

        return this.response({
          res,
          message: "پرداخت با ولت موفق بود",
          data: {
            user_challenge_id: result.userChallenge.id,
            account_instance_id: result.acc.id,
          },
        });
      }

      // 4) درگاه‌ها (commit قبل از redirect)
      await t.commit();

      if (gateway === "peykan") {
        const { redirectUrl } = await paykanService({
          userId: req.user.id,
          amountUsd,
          userChallenge: userChallenge.id,
          callback_url:
            "https://api-crm.myprop.trade/api/v1/global/callback-peykan-challenge",
        });

        return this.response({
          res,
          message: "در حال انتقال به درگاه...",
          data: { url: redirectUrl },
        });
      }

      if (gateway === "nowpayments") {
        const { invoiceUrl } = await createDepositUSDInvoice({
          amountUsd,
          user: req.user,
        });

        return this.response({
          res,
          message: "در حال انتقال به درگاه...",
          data: { url: invoiceUrl },
        });
      }

      return this.response({
        res,
        status: 400,
        message: "درگاه نامعتبر است",
      });
    } catch (err) {
      console.log(err);
      await t.rollback();
      return this.response({
        res,
        status: err.status || 500,
        message: err.message || "خطای سرور",
      });
    }
  }
  async getAnalysisData(req, res) {
    const mt_login = req?.params?.mt_login;
    if (!mt_login)
      return this.response({
        res,
        status: 400,
        message: "ارسال شناسه لاگین اجباری است",
      });

    const dataAccount = await fetchFullAccountAnalysis(mt_login);

    this.response({
      res,
      status: 200,
      message: "اطلاعات اکانت شما",
      data: { dataAccount },
    });
  }
};

module.exports = new Controller();
