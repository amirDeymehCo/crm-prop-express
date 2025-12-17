const Order = require("../../models/Order");
const Payment = require("../../models/Payment");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const AccountInstance = require("../../models/Challenge/AccountInstance");
const generateMainPassword = require("../BuyCh/CreatePassword");
const createMTUser = require("../BuyCh/CreateMTUser");
const ChallengePhase = require("../../models/Challenge/ChallengePhase");

async function lockPaymentByOrderId({ orderId, t }) {


    console.log("find order id payment=>", orderId)

    const payment = await Payment.findOne({
        where: { order_id: orderId },
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    if (!payment) throw Object.assign(new Error("تراکنشی یافت نشد"), { status: 400 });
    return payment;
}

async function lockOrderByGatewayOrderId({ orderId, t }) {
    const order = await Order.findOne({
        where: { gateway_order_id: orderId },
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    if (!order) throw Object.assign(new Error("سفارش یافت نشد"), { status: 400 });
    return order;
}

async function lockUserChallengeWithPlan({ userChallengeId, t }) {

    const userChallenge = await UserChallenge.findByPk(userChallengeId, {
        include: [ChallengePlan, { model: ChallengePhase, attributes: ["id", "group"] }],
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    if (!userChallenge) throw Object.assign(new Error("چالش یافت نشد"), { status: 400 });
    return userChallenge;
}

async function getOrCreatePhase1AccountInstance({ userChallenge, t }) {
    let acc = await AccountInstance.findOne({
        where: { user_challenge_id: userChallenge.id, phase_index: 1, cycle_no: 1 },
        transaction: t,
        lock: t.LOCK.UPDATE,
    });

    if (acc) return acc;

    const plan = userChallenge.ChallengePlan;
    const startingBalance = Number(plan.account_size_usd);

    acc = await AccountInstance.create(
        {
            user_id: userChallenge.user_id,
            user_challenge_id: userChallenge.id,
            phase_index: 1,
            cycle_no: 1,
            platform: "mt5",
            starting_balance_usd: startingBalance,
            display_balance_usd: startingBalance,
            status: "pending",
            created_by_admin_id: null,
            rules_snapshot: userChallenge.rules_snapshot || null,
        },
        { transaction: t }
    );

    return acc;
}

async function createAndAttachMTAccount({ acc, plan, orderKey, group, t }) {
    // اگر قبلاً mt_login ثبت شده، دوباره نساز (idempotent)
    if (acc.mt_login) return acc;

    const inPassword = generateMainPassword();
    const mPassword = generateMainPassword();

    const mt = await createMTUser({
        order_id: orderKey,
        balance: Number(acc.starting_balance_usd),
        emailuser: 0,

        eod_role: Number(plan.max_daily_drawdown_percent),
        start_balance_role: Number(plan.max_overall_drawdown_percent),

        // طبق صحبت جدید: ریسک شناور از روی پلن
        eod_relative: plan.has_floating_risk ? Number(plan.floating_risk_value || 0) : 0,

        inPassword,
        mPassword,
        leverge: plan.leverage,
        groupch: group,
    });

    if (!mt?.Login) throw Object.assign(new Error("ساخت حساب متاتریدر ناموفق بود"), { status: 500 });

    await acc.update(
        {
            mt_login: String(mt.Login),
            mt_server: group,
            mt_group: group,
            status: "active",
            activated_at: new Date(),
            mt_password: mPassword,
            in_password: inPassword,
        },
        { transaction: t }
    );

    return acc;
}

/**
 * این تابع “بعد از پرداخت موفق” رو کامل انجام میده.
 * هم برای callback درگاه و هم برای خرید با ولت استفاده میشه.
 */
async function finalizeChallengeAfterPaid({
    orderId,
    trackingCode = null,
    refNum = null,
    t,
}) {
    // 1) lock payment + idempotency
    const payment = await lockPaymentByOrderId({ orderId, t });


    if (String(payment.status).toLowerCase() === "confirmed") {
        // قبلا انجام شده
        return { alreadyDone: true };
    }
    if (!["pending", "waiting", "confirmed_free"].includes(String(payment.status))) {
        throw Object.assign(new Error("وضعیت تراکنش منتظر پرداخت نیست"), { status: 400 });
    }

    // 2) lock order
    const order = await lockOrderByGatewayOrderId({ orderId, t });

    // 3) lock challenge+plan
    const userChallenge = await lockUserChallengeWithPlan({
        userChallengeId: payment.UserChallenge, // همون فیلدی که خودت داری
        t,
    });

    // 4) payment confirmed + order paid
    await payment.update(
        { status: "confirmed", provider_payment_id: trackingCode },
        { transaction: t }
    );

    await order.update(
        {
            status: "paid",
            gateway_order_id: trackingCode || orderId,
            gateway_payment_id: refNum || null,
            paid_at: new Date(),
        },
        { transaction: t }
    );

    // 5) ensure account instance exists (phase1)
    const acc = await getOrCreatePhase1AccountInstance({ userChallenge, t });

    // 6) update challenge status
    await userChallenge.update(
        { status: "phase1", current_phase_index: 1 },
        { transaction: t }
    );

    // 7) create MT (idempotent)
    const orderKey = `${orderId}-${refNum || ""}`;
    await createAndAttachMTAccount({
        acc,
        plan: userChallenge.ChallengePlan,
        orderKey,
        t,
        group: userChallenge?.ChallengePhase?.group
    });

    return {
        alreadyDone: false,
        userChallenge,
        acc,
        order,
        payment,
    };
}

module.exports = { finalizeChallengeAfterPaid };
