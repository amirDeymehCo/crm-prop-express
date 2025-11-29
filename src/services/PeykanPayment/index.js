// services/paykanService.js
const axios = require("axios");
const Payment = require("../../models/Payment");
const { getDollarPrice } = require("../UsdPrice")

const PAYKAN_BASE = "https://pgw.paykan.ir";

async function getUsdToIrrRate() {
    const { price } = await getDollarPrice()

    return price + 2500
}

async function createDepositIRR({ userId, amountUsd }) {
    const rate = await getUsdToIrrRate();
    const amountIrr = Math.round(Number(amountUsd) * Number(rate));

    const orderId = `dep-${userId}-${Date.now()}`; // یکتا

    // ساخت رکورد Payment در حالت pending
    const payment = await Payment.create({
        order_id: orderId,
        user_id: userId,
        amount_irr: amountIrr,
        amount_usd: amountUsd,
        rate_irr_per_usd: rate,
        status: "pending",
        provider: "paykan"

    });

    const body = {
        merchant_id: process.env.PAYKAN_MERCHANT_ID,
        order_id: orderId,
        amount: amountIrr,
        callback_url: "https://panel.myprop.trade/login",
        callback_method: "POST",
    };

    try {
        const resp = await axios.post("https://pgw.paykan.ir/api/v1/withdraw/", body);
        console.log("Paykan withdraw resp:", resp.status, resp.data);
        if (resp.status !== 200 || !resp.data?.token) {
            throw new Error("Paykan create payment failed");
        }

        const { token, ref_num, pgw_amount } = resp.data;

        // ref_num برگشتی در create رو هم ذخیره کن
        payment.ref_num = ref_num;
        await payment.save();

        const redirectUrl = `${PAYKAN_BASE}/pgw/pay/${token}`;

        return { redirectUrl, payment };
    } catch (err) {
        console.log("Paykan withdraw status:", err.response?.status);
        console.log("Paykan withdraw headers:", err.response?.headers);
        console.log("Paykan withdraw data:", err.response?.data); // این همون HTML ساده‌ست
        throw err;
    }

}

module.exports = {
    createDepositIRR,
};
