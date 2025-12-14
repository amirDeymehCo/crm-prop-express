const sequelize = require("../../../db"); // اگر exportش فرق داره اینو عوض کن

const User = require("../../models/User");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../models/Challenge/ChallengePhase");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const UserChallengeRisk = require("../../models/UserChallengeRisk");
const Coupon = require("../../models/Coupon");
const CouponUsage = require("../../models/CouponUsage");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");

// ===================== helpers اصلی ===================== //

async function getActivePlan(planId, transaction) {
    const plan = await ChallengePlan.findOne({
        where: { id: planId, is_active: true },
        include: [ChallengePhase],
        transaction,
    });

    if (!plan) {
        const err = new Error("پلن چالش یافت نشد یا غیر فعال است");
        err.status = 404;
        throw err;
    }

    return plan;
}

// -------- بیمه ---------- //

function calculateInsurance(plan, withInsurance) {
    if (!withInsurance || !plan.allow_insurance) {
        return {
            enabled: false,
            fee_usd: 0,
            status: "none",
        };
    }

    let fee = 0;

    switch (plan.insurance_fee_type) {
        case "percent_of_price":
            fee = Number(plan.price_usd) * (Number(plan.insurance_value) / 100);
            break;
        case "percent_of_balance":
            fee = Number(plan.account_size_usd) * (Number(plan.insurance_value) / 100);
            break;
        case "fixed":
            fee = Number(plan.insurance_value);
            break;
        default:
            fee = 0;
    }

    return {
        enabled: true,
        fee_usd: fee,
        status: "active",
    };
}

// -------- کوپن تخفیف ---------- //

async function validateAndApplyCoupon({ couponCode, plan, user, insuranceFee, transaction }) {
    if (!couponCode) {
        return { coupon: null, discount: 0 };
    }

    const coupon = await Coupon.findOne({
        where: { code: couponCode, is_active: true },
        transaction,
    });

    if (!coupon) {
        const err = new Error("کد تخفیف نامعتبر است");
        err.status = 400;
        throw err;
    }

    const now = new Date();
    if (coupon.valid_from && coupon.valid_from > now) {
        const err = new Error("این کد هنوز فعال نشده است");
        err.status = 400;
        throw err;
    }
    if (coupon.valid_to && coupon.valid_to < now) {
        const err = new Error("این کد منقضی شده است");
        err.status = 400;
        throw err;
    }

    // محدود به پلن/نوع چالش خاص
    if (coupon.challenge_plan_id && coupon.challenge_plan_id !== plan.id) {
        const err = new Error("این کد برای این چالش قابل استفاده نیست");
        err.status = 400;
        throw err;
    }

    // سقف استفاده کلی
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
        const err = new Error("سقف استفاده از این کد پر شده است");
        err.status = 400;
        throw err;
    }

    // سقف برای هر کاربر
    const userUsageCount = await CouponUsage.count({
        where: { coupon_id: coupon.id, user_id: user.id },
        transaction,
    });
    if (coupon.max_uses_per_user && userUsageCount >= coupon.max_uses_per_user) {
        const err = new Error("شما قبلا از این کد استفاده کرده‌اید");
        err.status = 400;
        throw err;
    }

    const basePrice = Number(plan.price_usd) + Number(insuranceFee || 0);

    let discount = 0;
    if (coupon.type === "percent") {
        discount = basePrice * (Number(coupon.value) / 100);
    } else if (coupon.type === "fixed") {
        discount = Number(coupon.value);
    }

    // حداقل مبلغ سفارش
    if (coupon.min_order_amount_usd && basePrice < coupon.min_order_amount_usd) {
        const err = new Error("مبلغ سفارش برای استفاده از این کد کافی نیست");
        err.status = 400;
        throw err;
    }

    return { coupon, discount };
}

// -------- قیمت نهایی ---------- //

function buildPriceSummary({ plan, insuranceFee, discount }) {
    const basePrice = Number(plan.price_usd) + Number(insuranceFee || 0);
    const finalPrice = Math.max(basePrice - Number(discount || 0), 0);

    return {
        base_price_usd: basePrice,
        discount_usd: Number(discount || 0),
        final_price_usd: finalPrice,
    };
}

function buildFloatingRiskSnapshot(plan, startingBalance) {
    if (!plan.has_floating_risk) {
        return {
            floating_risk_enabled: false,
            floating_risk_type: null,
            floating_risk_value: null,
            floating_risk_base_on: null,
            floating_risk_max_risk_usd: null,
        };
    }

    const type = plan.floating_risk_type;
    const value = Number(plan.floating_risk_value || 0);
    const baseOn = plan.floating_risk_base_on || "starting_balance";

    const baseBalance =
        baseOn === "starting_balance" ? Number(startingBalance) : Number(startingBalance);
    // اگه خواستی بعدا بر اساس بالانس فعلی بگیری، اینجا تغییر می‌دی

    let maxRisk = 0;
    if (type === "percent") {
        maxRisk = baseBalance * (value / 100);
    } else if (type === "fixed") {
        maxRisk = value;
    }

    return {
        floating_risk_enabled: true,
        floating_risk_type: type,
        floating_risk_value: value,
        floating_risk_base_on: baseOn,
        floating_risk_max_risk_usd: maxRisk,
    };
}


// -------- ریسک شناور ---------- //

function calculateMaxRisk({ type, value, baseBalance }) {
    if (type === "percent") {
        return Number(baseBalance) * (Number(value) / 100);
    }
    // fixed
    return Number(value);
}

async function createFloatingRiskIfProvided({ userChallenge, floatingRiskPayload, transaction }) {
    // اگر فرانت چیزی برای ریسک نفرستاده، کاری نکن
    if (!floatingRiskPayload) return null;

    const {
        is_enabled = false,
        type = "percent",         // "percent" | "fixed"
        value = 1,                // مثلا 2% یا 10$
        base_on = "current_balance", // "starting_balance" | "current_balance"
    } = floatingRiskPayload;

    const baseBalance =
        base_on === "starting_balance"
            ? userChallenge.starting_balance_usd
            : userChallenge.display_balance_usd || userChallenge.starting_balance_usd;

    const maxRiskAmount = calculateMaxRisk({ type, value, baseBalance });

    const risk = await UserChallengeRisk.create(
        {
            user_challenge_id: userChallenge.id,
            is_enabled,
            type,
            value,
            base_on,
            last_base_balance_usd: baseBalance,
            max_risk_amount_usd: maxRiskAmount,
        },
        { transaction }
    );

    return risk;
}

// -------- ساخت رکورد چالش کاربر ---------- //

async function createUserChallengeRecord({
    user,
    plan,
    rulesSnapshot,
    insuranceInfo,
    prices,
    transaction,
}) {
    const startingBalance = plan.account_size_usd;

    const floatingRiskSnapshot = buildFloatingRiskSnapshot(plan, startingBalance);


    const userChallenge = await UserChallenge.create(
        {
            user_id: user.id,
            challenge_plan_id: plan.id,

            status: "pending_payment",
            current_phase_index: 1,

            starting_balance_usd: startingBalance,
            display_balance_usd: startingBalance,

            has_insurance: insuranceInfo.enabled,
            insurance_fee_usd: insuranceInfo.fee_usd || null,
            insurance_status: insuranceInfo.status,

            price_usd: prices.base_price_usd,
            discount_usd: prices.discount_usd,
            final_price_usd: prices.final_price_usd,

            rules_snapshot: rulesSnapshot,
            ...floatingRiskSnapshot
        },
        { transaction }
    );

    return userChallenge;
}

// -------- ثبت استفاده از کوپن ---------- //

async function registerCouponUsage({ coupon, user, userChallenge, discount, transaction }) {
    if (!coupon) return;

    await CouponUsage.create(
        {
            coupon_id: coupon.id,
            user_id: user.id,
            user_challenge_id: userChallenge.id,
            discount_amount_usd: Number(discount || 0),
        },
        { transaction }
    );

    await coupon.increment("used_count", { by: 1, transaction });
}

// -------- ساخت سفارش / پرداخت ---------- //

async function createOrderRecord({ user, provider, userChallenge, gateway, prices, transaction }) {
    const orderId = `buyCh-${user?.id}-${Date.now()}`; // یکتا

    // اینجا بسته به سیستم خودت می‌تونی چیزهای بیشتری ذخیره کنی
    const order = await Order.create(
        {
            user_id: user.id,
            user_challenge_id: userChallenge.id,
            amount_usd: prices.final_price_usd,
            gateway,                 // مثلا "peykan", "idpay", ...
            status: "pending",       // تا وقتی که callback درگاه بیاد
            gateway_order_id: orderId
        },
        { transaction }
    );
    await Payment.create(
        {
            provider,
            order_id: orderId,
            user_id: user?.id,
            amount_usd: prices?.final_price_usd,                 // مثلا "peykan", "idpay", ...
            status: "pending",       // تا وقتی که callback درگاه بیاد
            pay_currency: "usd",
            UserChallenge: userChallenge?.id
        },
        { transaction }
    );

    return order;
}

// ===================== کنترلر اصلی خرید ===================== //

/**
 * POST /api/challenges/purchase
 * body: { challenge_plan_id, gateway, with_insurance, coupon_code, floating_risk }
 */
async function purchaseChallenge(req, res, next) {
    const t = await sequelize.transaction();

    try {
        const user = req.user; // فرض: auth middleware اینو ست کرده

        const {
            challenge_plan_id,
            gateway,
            with_insurance = false,
            coupon_code,
            floating_risk, // { is_enabled, type, value, base_on }
        } = req.body;

        // 1) گرفتن پلن فعال + فازها
        const plan = await getActivePlan(challenge_plan_id, t);

        // 3) محاسبه بیمه
        const insuranceInfo = calculateInsurance(plan, with_insurance);

        // 4) اعتبارسنجی و اعمال کد تخفیف
        const { coupon, discount } = await validateAndApplyCoupon({
            couponCode: coupon_code,
            plan,
            user,
            insuranceFee: insuranceInfo.fee_usd,
            transaction: t,
        });

        // 5) محاسبه قیمت نهایی
        const prices = buildPriceSummary({
            plan,
            insuranceFee: insuranceInfo.fee_usd,
            discount,
        });

        // 6) ساخت رکورد چالش کاربر
        const userChallenge = await createUserChallengeRecord({
            user,
            plan,
            insuranceInfo,
            prices,
            transaction: t,
        });

        // 7) تنظیم ریسک شناور اگر چیزی آمده
        const floatingRisk = await createFloatingRiskIfProvided({
            userChallenge,
            floatingRiskPayload: floating_risk,
            transaction: t,
        });

        // 8) ثبت استفاده از کوپن
        await registerCouponUsage({
            coupon,
            user,
            userChallenge,
            discount,
            transaction: t,
        });

        // 9) ساخت سفارش / درخواست پرداخت (اگه سیستم پرداخت داری)
        const order = await createOrderRecord({
            user,
            provider: req?.body?.gateway,
            userChallenge,
            gateway,
            prices,
            transaction: t,
        });

        await t.commit();

        return {
            userChallenge,
            floatingRisk,
            order,
        }
    } catch (err) {
        await t.rollback();
        next(err);
    }
}



module.exports = purchaseChallenge
