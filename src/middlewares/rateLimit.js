// src/middlewares/rateLimit.js
const rateLimit = require("express-rate-limit");



// free routs  
const globalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 429,
        message: "تعداد درخواست‌های شما موقتاً محدود شده است. لطفاً چند دقیقه دیگر تلاش کنید.",
    },
});


// close routes (auth)
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 429,
        message: "تعداد درخواست‌های شما موقتاً محدود شده است. لطفاً چند دقیقه دیگر تلاش کنید.",
    },
});



// close by mobile email send otp
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        return req.body?.mobile || req.ip;
    },
    message: {
        status: 429,
        message: "ارسال کد تایید بیش از حد مجاز است. چند دقیقه دیگر دوباره تلاش کنید.",
    },
});


// close wallet routes by user_id 
const userStrictLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        if (req.user && req.user.id) return `user-${req.user.id}`;
        return `ip-${req.ip}`;
    },
    message: {
        status: 429,
        message: "تعداد عملیات مالی شما زیاد شده است. چند دقیقه بعد دوباره تلاش کنید.",
    },
});

module.exports = {
    globalLimiter,
    authLimiter,
    otpLimiter,
    userStrictLimiter,
};
