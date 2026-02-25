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
const founcList = require("../../../../utils/List");
const sequelize = require("../../../../../db");
const {
  generateCode,
  sendCode,
} = require("../../../../services/KavenegarService");
const { Op } = require("sequelize");

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
    const newCode = generateCode(4);
    const sent = await sendCode({
      receptor: req?.user?.mobile,
      token: newCode,
    });
    if (!sent) {
      return this.response({
        res,
        status: 500,
        message: "در ارسال کد تایید مشکلی پیش آمده است، بعدا امتحان کنید",
      });
    }

    await Otp.create({
      mobile: req?.user?.mobile,
      code: newCode,
      status: "waiting",
    });

    this.response({
      res,
      status: 200,
      message: "کد تایید به تلفن همراه شما ارسال شد",
    });
  }
  async widthdrawRequest(req, res) {
    const { wallet_address, amount_usd } = req?.body;

    const mobile = String(req.user.mobile).trim();
    const code = String(req.body.code).trim();

    const otp = await Otp.findOne({
      where: { mobile, status: "waiting" },
      order: [["createdAt", "DESC"]], // اگه چند تا OTP هست، آخریش
    });

    if (!otp) {
      return this.response({
        res,
        status: 400,
        message: "کدی برای این شماره تلفن ارسال نشده است",
      });
    }

    const pastTime = Date.now() - new Date(otp.createdAt).getTime();

    if (pastTime >= 2 * 60 * 1000) {
      otp.status = "expired";
      await otp.save();

      return this.response({
        res,
        status: 400,
        message: "کد ارسالی منقضی شده است",
      });
    }

    if (String(otp.code) !== code) {
      return this.response({
        res,
        status: 400,
        message: "کد ارسالی اشتباه است",
      });
    } else {
      otp.status = "verify";
      await otp.save();
    }

    const widthStatusWiaings = await WidthdrawRequest.findOne({
      where: { status: "waiting", user_id: req?.user?.id },
    });
    if (widthStatusWiaings)
      return this.response({
        res,
        status: 400,
        message: "کاربر گرامی، شما یک درخواست برداشت قبلا ثبت کرده اید",
      });

    const wallet = await Wallet.findOne({ where: { user_id: req?.user?.id } });
    if (!wallet || parseFloat(wallet?.balance) < parseFloat(amount_usd))
      return this.response({
        res,
        status: 400,
        message: "موچودی ولت شما کمتر از مقدار درخواستی هست",
      });

    await WidthdrawRequest.create({
      wallet_address,
      amount: parseFloat(amount_usd),
      status: "waiting",
      user_id: req?.user?.id,
    });
    this.response({
      res,
      status: 200,
      message: "کاربر مای پراپ درخواست برداشت شما ثبت شد!",
    });
  }
  async transactionsList(req, res) {
    req.cache.enabled = false;
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
      attributes: [
        "id",
        "type",
        "amount",
        "status",
        "created_at",
        [sequelize.literal("'wallet'"), "source"],
      ],
      raw: true,
    });

    // 3. orders (gateway only)
    const orderWhere = {
      user_id: req.user.id,
      gateway: { [Op.ne]: "wallet" },
    };
    if (status) orderWhere.status = status;

    const orders = await Order.findAll({
      where: orderWhere,
      attributes: [
        "id",
        ["type", "type"],
        ["amount_usd", "amount"],
        "status",
        "created_at",
        [sequelize.literal("'order'"), "source"],
      ],
      raw: true,
    });

    // 4. merge
    let items = [...walletTx, ...orders];

    // 5. sort (newest first)
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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
    req.cache.enabled = false;
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
