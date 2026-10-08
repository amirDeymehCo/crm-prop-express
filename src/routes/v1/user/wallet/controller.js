const Controllers = require("../../../controllers");
const {
  paykanService,
  verifyWithGatewayPeykan,
} = require("../../../../services/PeykanPayment");
const {
  createDepositUSDInvoice,
  handleIpnCallback,
} = require("../../../../services/NOWPayments");
const Wallet = require("../../../../models/Wallet");
const Payment = require("../../../../models/Payment");
const WidthdrawRequest = require("../../../../models/WidthdrawRequest");
const WalletTransaction = require("../../../../models/WalletTransaction");
const Order = require("../../../../models/Order");
const Otp = require("../../../../models/Otp");
const User = require("../../../../models/User");
const Setting = require("../../../../models/Setting");
const founcList = require("../../../../utils/List");
const sequelize = require("../../../../../db");
const {
  generateCode,
  sendCode,
} = require("../../../../services/KavenegarService");
const { Op } = require("sequelize");
const bcrypt = require("bcrypt");
const { normalizeSheba, isValidSheba } = require("../../../../utils/sheba");

// نرخ تومانی هر دلار برای برداشت ریالی.
// عمداً از نرخ واریز (dollar_price + bonus_dollar + 2500) جدا است؛ اگر
// withdraw_dollar_price ست نشده باشد، نرخ پایه‌ی dollar_price ملاک است.
const getWithdrawRate = async () => {
  const setting = await Setting.findOne({ where: { id: 1 } });

  const withdrawPrice = Number(setting?.withdraw_dollar_price || 0);
  const basePrice = Number(setting?.dollar_price || 0);

  return {
    // تومان به ازای هر دلار
    rate: withdrawPrice > 0 ? withdrawPrice : basePrice,
    min_withdraw_usd_irr: Number(setting?.min_withdraw_usd_irr || 0),
  };
};

// مبلغ دلاری → ریال. نرخ تومانی است، پس ×۱۰ می‌شود (مثل مسیر واریز).
const usdToIrr = (amountUsd, tomanRate) =>
  Math.round(Number(amountUsd) * Number(tomanRate)) * 10;

const Controller = class extends Controllers {
  async depositIRR(req, res) {
    try {
      const userId = req?.user?.id;
      const { amount_usd } = req.body;

      if (!amount_usd || Number(amount_usd) <= 0) {
        return res.status(400).json({ message: "لطفا مبلغ را درست وارد کنید" });
      }
      const { redirectUrl } = await paykanService({
        userId,
        amountUsd: amount_usd,
        callback_url:
          "https://api-crm.myprop.trade/api/v1/global/callback-peykan",
      });

      return this.response({
        res,
        status: 200,
        message: "درحال انتقال به درگاه پرداخت...",
        data: { url: redirectUrl },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "gateway error", data: e });
    }
  }
  async depositIRRCallback(req, res) {
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

    const payment = await Payment.findOne({ where: { order_id: order.id } });
    if (!payment)
      return this.response({ status: 400, res, message: "پرداختی یافت نشد" });

    // 2) اگر قبلاً پردازش شده، دوباره شارژ نکن
    if (payment.status === "paid" || order.status === "paid") {
      return res.redirect(
        process.env.FRONT_BASE_URL + "/account/wallet?successPayment=true",
      );
    }

    // 3) verify واقعی با درگاه (مهم‌ترین بخش)
    const verify = await verifyWithGatewayPeykan(data); // باید از API درگاه نتیجه قطعی بگیری
    if (!verify?.success) {
      await payment.update({
        status: "failed",
        meta: JSON.stringify({ data, verify }),
      });
      await order.update({ status: "failed" });
      return res.redirect("/account/wallet?successPayment=false");
    }

    // 4) مبلغ verify باید با مبلغ سفارش/پرداخت match شود (خیلی مهم)
    // اگر واحدها فرق دارن (ریال/تومان/...) اینجا normalize کن
    // if (verify.amount !== order.amount_irr) ...

    // 5) اعمال شارژ: transaction + idempotency روی tracking_code
    await sequelize.transaction(async (t) => {
      // دوباره داخل تراکنش چک کن (برای همزمانی)
      const alreadyTx = await WalletTransaction.findOne({
        where: { ref_id: verify.ref_num }, // یا tracking_code
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (alreadyTx) return;

      await payment.update(
        {
          status: "paid",
          provider_payment_id: verify.tracking_code,
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
          ref_id: verify.ref_num,
          status: "completed",
          meta: JSON.stringify({ data, verify }),
          wallet_id: wallet.id,
        },
        { transaction: t },
      );

      wallet.balance = Number(wallet.balance) + amountUSD;
      await wallet.save({ transaction: t });
    });

    return res.redirect("/account/wallet?successPayment=true");
  }

  async depositUSD(req, res, next) {
    try {
      const { amount_usd } = req.body;
      const user = req.user;

      const { invoiceUrl, payment } = await createDepositUSDInvoice({
        user,
        amountUsd: amount_usd,
        callback_url:
          "https://api-crm.myprop.trade/api/v1/user/wallet/deposit/nowpayment/ipn",
      });

      res.status(200).json({
        message: "درحال انتقال به درگاه پرداخت...",
        data: {
          url: invoiceUrl,
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
  async createOtpWidhdraw(req, res) {
    const mobile = String(req?.user?.mobile || "").trim();

    if (!mobile) {
      return this.response({
        res,
        status: 400,
        message: "شماره موبایل کاربر معتبر نیست",
      });
    }

    const newCode = generateCode(4);

    const sent = await sendCode({
      receptor: mobile,
      token: newCode,
    });

    if (!sent) {
      return this.response({
        res,
        status: 500,
        message: "در ارسال کد تایید مشکلی پیش آمده است، بعدا امتحان کنید",
      });
    }

    const codeHash = await bcrypt.hash(String(newCode), 10);

    await Otp.update(
      { status: "expired" },
      {
        where: {
          mobile,
          status: "waiting",
        },
      },
    );

    await Otp.create({
      mobile,
      code: null,
      code_hash: codeHash,
      attempts: 0,
      expires_at: new Date(Date.now() + 2 * 60 * 1000),
      status: "waiting",
    });

    return this.response({
      res,
      status: 200,
      message: "کد تایید به تلفن همراه شما ارسال شد",
    });
  }
  async withdrawList(req, res) {
    const where = { user_id: req?.user?.id };

    if (req?.query?.method) where.method = req.query.method;

    const list = await founcList(WidthdrawRequest, req, where);

    this.response({ res, data: list });
  }
  /**
   * اطلاعاتی که فرانت برای رندر فرم برداشت لازم دارد:
   * موجودی ولت، نرخ برداشت ریالی، حداقل مبلغ و شبای ذخیره‌شده‌ی کاربر.
   */
  async withdrawInfo(req, res) {
    const wallet = await Wallet.findOne({ where: { user_id: req?.user?.id } });
    const { rate, min_withdraw_usd_irr } = await getWithdrawRate();

    const pending = await WidthdrawRequest.findOne({
      where: {
        user_id: req?.user?.id,
        status: {
          [Op.in]: [
            "waiting",
            "verify",
            "reuqest_waiting",
            "request_prograssing",
            "request_pending_paid",
          ],
        },
      },
      order: [["createdAt", "DESC"]],
    });

    this.response({
      res,
      message: "اطلاعات برداشت",
      data: {
        balance_usd: Number(wallet?.balance || 0),
        // نرخ تومانی هر دلار
        withdraw_rate_toman: rate,
        // معادل ریالی هر دلار (برای محاسبه‌ی لحظه‌ای در فرانت)
        withdraw_rate_irr: rate * 10,
        min_withdraw_usd_irr,
        irr_enabled: rate > 0,
        sheba: req?.user?.sheba || null,
        has_pending_request: Boolean(pending),
        pending_request: pending
          ? { id: pending.id, method: pending.method, status: pending.status }
          : null,
      },
    });
  }
  async widthdrawRequest(req, res) {
    const { wallet_address, amount_usd } = req?.body;

    const method = req?.body?.method === "irr" ? "irr" : "crypto";

    const mobile = String(req?.user?.mobile || "").trim();
    const code = String(req?.body?.code || "").trim();

    if (!mobile || !code) {
      return this.response({
        res,
        status: 400,
        message: "کد تایید یا شماره موبایل معتبر نیست",
      });
    }

    const otp = await Otp.findOne({
      where: {
        mobile,
        status: "waiting",
      },
      order: [["createdAt", "DESC"]],
    });

    if (!otp) {
      return this.response({
        res,
        status: 400,
        message: "کدی برای این شماره تلفن ارسال نشده است",
      });
    }

    if (otp.expires_at && new Date(otp.expires_at).getTime() <= Date.now()) {
      otp.status = "expired";
      await otp.save();

      return this.response({
        res,
        status: 400,
        message: "کد ارسالی منقضی شده است",
      });
    }

    if (otp.attempts >= 5) {
      otp.status = "expired";
      await otp.save();

      return this.response({
        res,
        status: 400,
        message: "تعداد تلاش‌های ناموفق بیش از حد مجاز است",
      });
    }

    const isCodeValid = await bcrypt.compare(code, otp.code_hash);

    if (!isCodeValid) {
      otp.attempts += 1;
      await otp.save();

      return this.response({
        res,
        status: 400,
        message: "کد ارسالی اشتباه است",
      });
    }

    otp.status = "verify";
    await otp.save();

    // درخواست باز (در هر وضعیتی که هنوز تسویه نشده) اجازه‌ی درخواست جدید نمی‌دهد
    const widthStatusWiaings = await WidthdrawRequest.findOne({
      where: {
        status: {
          [Op.in]: [
            "waiting",
            "verify",
            "reuqest_waiting",
            "request_prograssing",
            "request_pending_paid",
          ],
        },
        user_id: req?.user?.id,
      },
    });

    if (widthStatusWiaings) {
      return this.response({
        res,
        status: 400,
        message: "کاربر گرامی، شما یک درخواست برداشت قبلا ثبت کرده اید",
      });
    }

    const amountUsd = parseFloat(amount_usd);

    const wallet = await Wallet.findOne({
      where: {
        user_id: req?.user?.id,
      },
    });

    if (!wallet || parseFloat(wallet?.balance) < amountUsd) {
      return this.response({
        res,
        status: 400,
        message: "موجودی ولت شما کمتر از مقدار درخواستی است",
      });
    }

    const newRequest = {
      method,
      amount: amountUsd,
      status: "waiting",
      user_id: req?.user?.id,
    };

    let sheba = null;

    if (method === "irr") {
      sheba = normalizeSheba(req?.body?.sheba);

      if (!isValidSheba(sheba)) {
        return this.response({
          res,
          status: 400,
          message: "شماره شبا معتبر نیست",
        });
      }

      const { rate, min_withdraw_usd_irr } = await getWithdrawRate();

      if (!(rate > 0)) {
        return this.response({
          res,
          status: 400,
          message:
            "برداشت ریالی در حال حاضر فعال نیست، لطفا با پشتیبانی تماس بگیرید",
        });
      }

      if (min_withdraw_usd_irr > 0 && amountUsd < min_withdraw_usd_irr) {
        return this.response({
          res,
          status: 400,
          message: `حداقل مبلغ برداشت ریالی ${min_withdraw_usd_irr} دلار است`,
        });
      }

      newRequest.sheba = sheba;
      newRequest.account_holder =
        String(req?.body?.account_holder || "").trim() ||
        `${req?.user?.firstname || ""} ${req?.user?.lastname || ""}`.trim();
      newRequest.rate_irr_per_usd = rate;
      newRequest.amount_irr = usdToIrr(amountUsd, rate);
    } else {
      newRequest.wallet_address = wallet_address;
    }

    const createdRequest = await WidthdrawRequest.create(newRequest);

    // شبا را روی پروفایل کاربر نگه می‌داریم تا دفعه‌ی بعد فرم prefill شود
    if (method === "irr" && sheba && req?.user?.sheba !== sheba) {
      await User.update({ sheba }, { where: { id: req?.user?.id } });
    }

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore - amountUsd;

    await wallet.update({ balance: balanceAfter });

    await WalletTransaction.create({
      type: "withdraw",
      amount: amountUsd,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      status: "completed",
      actor_type: "system",
      wallet_id: wallet?.id,
      reference_id: String(createdRequest.id),
      description:
        method === "irr"
          ? `بلوکه شدن مبلغ ${amountUsd.toLocaleString()} دلار جهت برداشت ریالی به شبا`
          : `بلوکه شدن مبلغ ${amountUsd.toLocaleString()} دلار جهت برداشت از ولت`,
    });

    return this.response({
      res,
      status: 200,
      message: "کاربر مای پراپ درخواست برداشت شما ثبت شد!",
      data: {
        id: createdRequest.id,
        method: createdRequest.method,
        amount_usd: Number(createdRequest.amount),
        amount_irr: createdRequest.amount_irr
          ? Number(createdRequest.amount_irr)
          : null,
        status: createdRequest.status,
      },
    });
  }
  async transactionsList(req, res) {
    const {
      query: { page = 1, limit = 5, type, status },
    } = req;

    const currentPage = Number(page);
    const perPage = Number(limit);

    // 1. find wallet
    const wallet = await Wallet.findOne({
      where: { user_id: req.user.id },
    });

    if (!wallet) {
      return this.response({
        res,
        message: "کیف پول یافت نشد",
        data: {
          totalCount: 0,
          currentPage,
          totalPages: 0,
          limit: perPage,
          items: [],
        },
      });
    }

    // 2. wallet tx
    const walletWhere = { wallet_id: wallet.id };
    if (type) walletWhere.type = type;
    if (status) walletWhere.status = status;

    const walletTx = await WalletTransaction.findAll({
      where: walletWhere,
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "type",
        "amount",
        "status",
        "createdAt",
        [sequelize.literal("'wallet'"), "source"],
      ],
      raw: true,
    });

    // 3. orders (gateway only)
    const orderWhere = {
      user_id: req.user.id,
      // gateway: { [Op.ne]: "wallet" },
    };
    if (status) orderWhere.status = status;

    const orders = await Order.findAll({
      where: orderWhere,
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        ["type", "type"],
        ["amount_usd", "amount"],
        "status",
        "createdAt",
        [sequelize.literal("'order'"), "source"],
      ],
      raw: true,
    });

    // 4. merge
    let items = [...walletTx, ...orders];

    // 5. sort (newest first)
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 6. pagination (in-memory)
    const totalCount = items.length;
    const totalPages = Math.ceil(totalCount / perPage);
    const offset = (currentPage - 1) * perPage;

    items = items.slice(offset, offset + perPage);

    // 7. response
    this.response({
      res,
      message: "تاریخچه تراکنش‌ها",
      data: {
        totalCount,
        currentPage,
        totalPages,
        limit: perPage,
        items,
      },
    });
  }
  async states(req, res) {
    const stats = await WalletTransaction.findAll({
      where: { wallet_id: req?.user?.wallet?.id },
      attributes: [
        "type",
        "status",
        [sequelize.fn("SUM", sequelize.col("amount")), "total"],
      ],
      group: ["type", "status"],
    });

    let totals = {
      total_deposit: 0,
      total_spent: 0,
      total_expired: 0,
      total_withdraw: 0,
    };

    stats.forEach((row) => {
      const type = row.type;
      const total = parseFloat(row.dataValues.total) || 0;

      if (row.status === "harvested" || row.status === "failed") {
        totals.total_expired += total;
      } else {
        if (type === "deposit") totals.total_deposit += total;
        if (type === "transfer_out") totals.total_spent += total;
        if (type === "withdraw") totals.total_withdraw += total;
      }
    });

    this.response({ res, message: "اطلاعات ولت", data: totals });
  }
};

module.exports = new Controller();
