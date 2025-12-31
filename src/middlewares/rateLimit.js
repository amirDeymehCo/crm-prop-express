// src/middlewares/rateLimit.js
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

/**
 * 🟢 Free routes (global)
 */
const globalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => ipKeyGenerator(req, res),
    message: {
        status: 429,
        message:
            "تعداد درخواست‌های شما موقتاً محدود شده است. لطفاً چند دقیقه دیگر تلاش کنید.",
    },
});

/**
 * 🔐 Auth routes (login, register)
 */
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => ipKeyGenerator(req, res),
    message: {
        status: 429,
        message:
            "تعداد درخواست‌های شما موقتاً محدود شده است. لطفاً چند دقیقه دیگر تلاش کنید.",
    },
});

/**
 * 📱 OTP routes (mobile / email)
 * priority: mobile → email → ip
 */
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        if (req.body?.mobile) return `mobile-${req.body.mobile}`;
        if (req.body?.email) return `email-${req.body.email}`;
        return ipKeyGenerator(req, res);
    },
    message: {
        status: 429,
        message:
            "ارسال کد تأیید بیش از حد مجاز است. چند دقیقه دیگر دوباره تلاش کنید.",
    },
});

/**
 * 💰 Wallet / financial routes (strict)
 * priority: user_id → ip
 */
const userStrictLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        if (req.user?.id) return `user-${req.user.id}`;
        return `ip-${ipKeyGenerator(req, res)}`;
    },
    message: {
        status: 429,
        message:
            "تعداد عملیات مالی شما زیاد شده است. چند دقیقه بعد دوباره تلاش کنید.",
    },
});

module.exports = {
    globalLimiter,
    authLimiter,
    otpLimiter,
    userStrictLimiter,
};
