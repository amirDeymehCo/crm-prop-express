// services/paykanService.js
const axios = require("axios");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const { getDollarPrice } = require("../UsdPrice");

const PAYKAN_BASE = "https://pgw.paykan.ir";

async function getUsdToIrrRate() {
  const { price } = await getDollarPrice();

  return price + 2500;
}

async function paykanService({
  userId,
  amountUsd,
  callback_url = "https://api.myprop.trade/api/v1/web/show-data-getway",
  userChallenge = null,
}) {
  const rate = await getUsdToIrrRate();
  const amountIrr = Math.round(Number(amountUsd) * Number(rate));

  const orderId = `dep-${userId}-${Date.now()}`; // یکتا

  await Order.create({
    gateway_order_id: orderId,
    user_id: userId,
    amount_irr: amountIrr,
    amount_usd: amountUsd,
    currency: "IRR",
    gateway: "peykan",
    status: "pending",
    type: "wallet_deposit",
  });

  // ساخت رکورد Payment در حالت pending
  const payment = await Payment.create({
    order_id: orderId,
    user_id: userId,
    amount_irr: amountIrr,
    amount_usd: amountUsd,
    rate_irr_per_usd: rate,
    status: "pending",
    provider: "paykan",
    raw_callback: callback_url,
    UserChallenge: userChallenge,
  });

  const body = {
    merchant_id: process.env.PAYKAN_MERCHANT_ID,
    order_id: orderId,
    amount: amountIrr,
    callback_url,
    callback_method: "GET",
  };

  try {
    const resp = await axios.post(
      "https://pgw.paykan.ir/api/v1/withdraw/",
      body,
    );
    if (resp.status !== 200 || !resp.data?.token) {
      throw new Error("ساخت پیکان مشکلی پیش اومده است");
    }

    const { token, ref_num } = resp.data;

    // ref_num برگشتی در create رو هم ذخیره کن
    payment.ref_num = ref_num;
    await payment.save();

    const redirectUrl = `${PAYKAN_BASE}/pgw/pay/${token}`;

    return { redirectUrl, payment };
  } catch (err) {
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
      amount: amount,
      tracking_code: trackingCode,
      ref_num: refNum,
    };

    if (cardNo) {
      body.card_no = cardNo;
    }

    const resp = await axios.post(
      "https://pgw.paykan.ir/api/v1/verify/",
      body,
      { timeout: 10000 },
    );

    if (resp.status !== 200) {
      throw new Error("پاسخ نامعتبر از درگاه پیکان");
    }

    const { status, message, data } = resp.data;

    return {
      success: status === 200,
      refNum: data.ref_num,
      amount: data.amount,
      cardNumber: data.card_number,
    };
  } catch (err) {
    console.error("Paykan Verify Error:", err?.response?.data || err.message);
    throw err;
  }
};

module.exports = {
  paykanService,
  verifyWithGateway,
};
