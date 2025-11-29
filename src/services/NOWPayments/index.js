// src/services/NOWPayments/index.js
const axios = require("axios");
const crypto = require("crypto");
const Payment = require("../../models/Payment");
const Wallet = require("../../models/Wallet");
const sequelize = require("../../../db");

// const NOW_BASE_URL = process.env.NOWPAYMENTS_BASE_URL || "https://api.nowpayments.io";
const NOW_BASE_URL = process.env.NOWPAYMENTS_BASE_URL || "https://api-sandbox.nowpayments.io";
const NOW_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOW_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

// axios instance
const client = axios.create({
    baseURL: NOW_BASE_URL,
    headers: {
        "x-api-key": NOW_API_KEY,
        "Content-Type": "application/json",
    },
});

// ۱) ساختن invoice (کاربر رو می‌فرستی روی صفحه پرداخت NOWPayments)
async function createDepositUSDInvoice({ user, amountUsd }) {
    // 1. توی دیتابیس یه رکورد Payment بساز
    const orderId = `now-${user.id}-${Date.now()}`;

    const payment = await Payment.create({
        provider: "nowpayments",
        order_id: orderId,
        user_id: user.id,
        amount_usd: amountUsd,
        status: "pending",
    });

    // 2. درخواست به NOWPayments → invoice
    const body = {
        price_amount: Number(amountUsd),
        price_currency: "usd",
        order_id: orderId,
        order_description: `Wallet deposit for user #${user.id}`,
        ipn_callback_url: `${process.env.API_BASE_URL}/api/v1/user/wallet/deposit/nowpayment/ipn`,
        success_url: `${process.env.FRONT_BASE_URL}/wallet/deposit-success`,
        cancel_url: `${process.env.FRONT_BASE_URL}/wallet/deposit-cancel`,
    };

    const { data } = await client.post("/v1/invoice", body); // endpoint رسمی invoice :contentReference[oaicite:3]{index=3}

    // data معمولاً شامل id و invoice_url هست
    await payment.update({
        provider_payment_id: data.id?.toString(),
    });

    return {
        payment,
        invoiceUrl: data.invoice_url,
    };
}

// ۲) اعتبارسنجی IPN (امضا)
function verifyIpnSignature(rawBody, signatureHeader) {
    if (!signatureHeader) return false;


    const params = rawBody;
    const sortedString = JSON.stringify(params, Object.keys(params).sort());

    const hmac = crypto.createHmac("sha512", NOW_IPN_SECRET.trim());
    hmac.update(sortedString);
    const expected = hmac.digest("hex");

    return expected === signatureHeader;
}

// ۳) هندل کردن IPN و شارژ ولت
async function handleIpnCallback(rawBody, signatureHeader) {
    // 1. امضا رو چک کن
    const ok = verifyIpnSignature(rawBody, signatureHeader); // :contentReference[oaicite:4]{index=4}
    if (!ok) {
        throw new Error("NOWPayments IPN signature invalid");
    }

    // نمونه body:
    // { payment_id, payment_status, price_amount, price_currency, order_id, pay_amount, pay_currency, ... } :contentReference[oaicite:5]{index=5}
    const {
        payment_id,
        payment_status,
        price_amount,
        price_currency,
        order_id,
        pay_amount,
        pay_currency,
    } = rawBody;

    // فقط پرداخت‌های USD که خودمون ساختیم
    if (price_currency?.toLowerCase() !== "usd") {
        // اگر لازم داری لاگ کنی
    }

    const payment = await Payment.findOne({ where: { order_id } });
    if (!payment) {
        throw new Error("Payment record not found for order_id " + order_id);
    }

    // اگر قبلاً فینیش شده، دیگه کاری نکن
    if (payment.status === "finished") {
        return payment;
    }

    // در چه وضعیت‌هایی شارژ کنیم؟
    // معمولا یا روی 'finished' ولت داخلی رو شارژ می‌کنی
    // (می‌تونی اگر می‌خوای aggressive باشی روی 'confirmed' هم شارژ کنی) :contentReference[oaicite:6]{index=6}
    if (["finished", "confirmed"].includes(payment_status)) {
        // ترنزاکشن دیتابیسی برای آپدیت ولت
        await sequelize.transaction(async (t) => {
            // آپدیت payment
            await payment.update(
                {
                    status: payment_status,
                    pay_amount,
                    pay_currency,
                    raw_callback: rawBody,
                },
                { transaction: t }
            );

            // شارژ ولت دلاری
            const wallet = await Wallet.findOne({
                where: { user_id: payment.user_id },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!wallet) throw new Error("Wallet not found");

            // balance + price_amount
            const newBalance =
                parseFloat(wallet.balance) + parseFloat(price_amount);

            await wallet.update(
                { balance: newBalance },
                { transaction: t }
            );
        });
    } else {
        // فقط وضعیت رو آپدیت کن (failed, expired, partially_paid, ...)
        await payment.update({
            status: payment_status,
            pay_amount,
            pay_currency,
            raw_callback: rawBody,
        });
    }

    return payment;
}

module.exports = {
    createDepositUSDInvoice,
    handleIpnCallback,
};
