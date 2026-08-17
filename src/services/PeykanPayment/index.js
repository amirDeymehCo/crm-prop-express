// services/paykanService.js
const axios = require("axios");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const Setting = require("../../models/Setting");

const PAYKAN_BASE = "https://pgw.paykan.app";

async function getUsdToIrrRate() {
  const setting = await Setting.findOne({ where: { id: 1 } });
  const dollarPrice = Number(setting?.dollar_price || 0);

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
  const dollarPrice = Number(setting?.dollar_price || 0);

  const amountUsdValue = Number(amountUsd || 0);
  const discountUsdValue = Number(discountUsd || 0);
  const finalAmountUsdValue = Math.max(amountUsdValue - discountUsdValue, 0);

  const amountIrr = Math.round(amountUsdValue * dollarPrice) * 10;
  const discountIrr = Math.round(discountUsdValue * dollarPrice) * 10;
  const finalAmountIrr = Math.round(finalAmountUsdValue * dollarPrice) * 10;

  const userChallengeId =
    typeof userChallenge === "object" && userChallenge !== null
      ? userChallenge.id
      : userChallenge;

  if (createOrder) {
    // 1) ساخت Order
    order = await Order.create({
      gateway_order_id: orderId,
      user_id: userId,
      user_challenge_id: userChallengeId,

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
        rate_irr_per_usd: dollarPrice,
        status: "paid",
        provider: "coupon_free",
        raw_callback: callback_url,
        user_challenge_id: userChallengeId,
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
    rate_irr_per_usd: dollarPrice,
    status: "pending",
    provider: "peykan",
    raw_callback: callback_url,
    user_challenge_id: userChallengeId,
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

    payment.ref_num = ref_num || null;
    await payment.save();

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
