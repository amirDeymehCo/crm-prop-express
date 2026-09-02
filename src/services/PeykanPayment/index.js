// services/paykanService.js
const axios = require("axios");
const { randomUUID } = require("crypto");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const Setting = require("../../models/Setting");

const PAYKAN_BASE = "https://pgw.paykan.app";

async function getUsdToIrrRate() {
  const setting = await Setting.findOne({ where: { id: 1 } });
  const dollarPrice =
    Number(setting?.dollar_price || 0) + Number(setting?.bonus_dollar);

  // اگر خواستی حاشیه امن هم اضافه کنی
  return dollarPrice + 2500;
}

async function paykanService({
  userId,
  amountUsd,
  callback_url = "https://api.myprop.trade/api/v1/web/show-data-getway",
  userChallenge = null,
  type = "wallet_deposit",
  discountUsd = 0,
  createOrder = true,
  orderSelect = null,
  base_amount_usd = 0,
}) {
  let order = orderSelect ? orderSelect : null;
  const orderId = orderSelect?.gateway_order_id
    ? orderSelect?.gateway_order_id
    : `buyCh-${userId}-${Date.now()}`;

  const setting = await Setting.findOne({ where: { id: 1 } });
  const dollarPrice =
    Number(setting?.dollar_price || 0) + Number(setting?.bonus_dollar);

  // ⚠️ اگر سفارش از قبل ساخته شده، مبالغ همان سفارش ملاک است و اینجا
  // هیچ محاسبه‌ای انجام نمی‌شود. در غیر این صورت تخفیف دو بار کم می‌شد:
  // یک بار موقع ساخت سفارش و یک بار اینجا — که با کوپن‌های بزرگ مبلغ را
  // صفر می‌کرد و درگاه درخواست را رد می‌کرد.
  // ضمناً مبلغ ارسالی به درگاه باید دقیقاً با order.amount_irr یکی باشد،
  // چون کال‌بک همان را verify می‌کند.
  const hasExistingOrder = Boolean(order);

  const amountUsdValue = hasExistingOrder
    ? Number(order.amount_usd || 0)
    : Number(amountUsd || 0);

  const discountUsdValue = hasExistingOrder
    ? Number(order.discount_usd || 0)
    : Number(discountUsd || 0);

  const finalAmountUsdValue = hasExistingOrder
    ? Number(order.final_amount_usd ?? order.amount_usd ?? 0)
    : Math.max(Number(amountUsd || 0) - Number(discountUsd || 0), 0);

  const amountIrr = hasExistingOrder
    ? Number(order.amount_irr || 0)
    : Math.round(amountUsdValue * dollarPrice) * 10;

  const discountIrr = hasExistingOrder
    ? Number(order.discount_irr || 0)
    : Math.round(discountUsdValue * dollarPrice) * 10;

  const finalAmountIrr = hasExistingOrder
    ? Number(order.final_amount_irr || order.amount_irr || 0)
    : Math.round(finalAmountUsdValue * dollarPrice) * 10;

  if (hasExistingOrder && !(finalAmountIrr > 0)) {
    throw Object.assign(
      new Error("مبلغ سفارش برای ارسال به درگاه معتبر نیست"),
      { status: 400 },
    );
  }

  const userChallengeId =
    typeof userChallenge === "object" && userChallenge !== null
      ? userChallenge.id
      : userChallenge;

  if (createOrder) {
    // 1) ساخت Order
    // ⚠️ order_group_id در مدل NOT NULL و بدون default است؛ اگر ستش نکنیم
    // روی سرور (sql_mode سخت‌گیرانه) خطای 1364 می‌گیریم.
    order = await Order.create({
      gateway_order_id: orderId,
      user_id: userId,
      user_challenge_id: userChallengeId,

      order_group_id: randomUUID(),

      amount_usd: amountUsdValue,
      discount_usd: discountUsdValue,
      final_amount_usd: finalAmountUsdValue,

      base_amount_usd: base_amount_usd || amountUsdValue,

      amount_irr: amountIrr,
      discount_irr: discountIrr,
      final_amount_irr: finalAmountIrr,

      gateway: finalAmountUsdValue === 0 ? "coupon_free" : "peykan",
      status: finalAmountUsdValue === 0 ? "paid" : "pending",
      type,
    });

    // 2) اگر مبلغ نهایی صفره، نیازی به درگاه نیست
    if (finalAmountUsdValue === 0) {
      const payment = await Payment.create({
        order_id: orderId,
        user_id: userId,
        amount_irr: 0,
        amount_usd: 0,
        status: "paid",
        provider: "coupon_free",
        raw_callback: { callback_url, rate_irr_per_usd: dollarPrice },
        UserChallenge: userChallengeId,
      });

      return {
        order,
        payment,
        redirectUrl: null,
        free: true,
      };
    }
  }

  // 3) ساخت رکورد Payment در حالت pending
  const payment = await Payment.create({
    order_id: orderId,
    user_id: userId,
    amount_irr: finalAmountIrr,
    amount_usd: finalAmountUsdValue,
    status: "pending",
    provider: "peykan",
    raw_callback: { callback_url, rate_irr_per_usd: dollarPrice },
    UserChallenge: userChallengeId,
  });

  const body = {
    merchant_id: process.env.PAYKAN_MERCHANT_ID,
    order_id: orderId,
    amount: finalAmountIrr,
    callback_url,
    callback_method: "GET",
    description: `شناسه سفارش: ${userChallengeId ?? orderId}`,
  };

  try {
    const resp = await axios.post(`${PAYKAN_BASE}/api/v1/withdraw/`, body);

    if (resp.status !== 200 || !resp.data?.token) {
      throw new Error("ساخت توکن پیکان با مشکل مواجه شد");
    }

    const { token, ref_num } = resp.data;

    // مدل Payment ستون ref_num ندارد؛ شناسه‌ی درگاه در provider_payment_id می‌نشیند
    await payment.update({ provider_payment_id: ref_num || null });

    const redirectUrl = `${PAYKAN_BASE}/pgw/pay/${token}`;

    return { redirectUrl, payment, order };
  } catch (err) {
    console.log(
      "Paykan error data:",
      JSON.stringify(err.response?.data, null, 2),
    );
    console.log("Paykan status:", err.response?.status);
    console.log("Paykan request id:", err.response?.headers?.["x-request-id"]);

    throw err;
  }
}

const verifyWithGateway = async ({
  orderId,
  amount,
  trackingCode,
  refNum,
  cardNo,
}) => {
  try {
    const body = {
      merchant_id: process.env.PAYKAN_MERCHANT_ID,
      order_id: orderId,
      amount,
      tracking_code: trackingCode,
      ref_num: refNum,
    };

    if (cardNo) {
      body.card_no = cardNo;
    }

    const resp = await axios.post(`${PAYKAN_BASE}/api/v1/verify/`, body, {
      timeout: 10000,
    });

    if (resp.status !== 200) {
      throw new Error("پاسخ نامعتبر از درگاه پیکان");
    }

    const { status, data } = resp.data;

    return {
      success: status === "CONFIRMED",
      refNum: data?.ref_num ?? null,
      amount: data?.amount ?? null,
      cardNumber: data?.card_number ?? null,
      status,
    };
  } catch (err) {
    return {
      success: false,
      refNum: null,
      amount: null,
      cardNumber: null,
      status: "FAILED",
    };
  }
};

module.exports = {
  paykanService,
  verifyWithGateway,
};
