const Order = require("../../models/Order");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const AccountInstance = require("../../models/Challenge/AccountInstance");
const generateMainPassword = require("../BuyCh/CreatePassword");
const createMTUser = require("../BuyCh/CreateMTUser");
const ChallengePhase = require("../../models/Challenge/ChallengePhase");
const ReferralCommissionRule = require("../../models/ReferralCommissionRule");
const ReferralCommission = require("../../models/ReferralCommission");
const Wallet = require("../../models/Wallet");
const WalletTransaction = require("../../models/WalletTransaction");
const Setting = require("../../models/Setting");

async function lockPaymentByOrderId({ orderId, t }) {
  console.log("find order id payment=>", orderId);

  const payment = await Order.findOne({
    where: { gateway_order_id: orderId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!payment)
    throw Object.assign(new Error("تراکنشی یافت نشد"), { status: 400 });
  return payment;
}

async function lockOrderByGatewayOrderId({ orderId, t }) {
  console.log("orderId=>>>", orderId);

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
    include: [
      ChallengePlan,
      { model: ChallengePhase, attributes: ["id", "group"] },
    ],
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!userChallenge)
    throw Object.assign(new Error("چالش یافت نشد"), { status: 400 });
  return userChallenge;
}

async function getOrCreatePhase1AccountInstance({
  userChallenge,
  t,
  platform,
  email = null,
  forceCreate = false,
  phaseIndex = 1,
}) {
  let acc = await AccountInstance.findOne({
    where: {
      user_challenge_id: userChallenge.id,
      phase_index: phaseIndex,
      cycle_no: 1,
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!forceCreate && acc) return acc;

  const plan = userChallenge.ChallengePlan;

  const startingBalance = Number(plan.balance);

  acc = await AccountInstance.create(
    {
      user_id: userChallenge.user_id,
      user_challenge_id: userChallenge.id,
      phase_index: phaseIndex,
      cycle_no: 1,
      platform,
      email: email || null,
      starting_balance_usd: startingBalance,
      display_balance_usd: startingBalance,
      status: "pending",
      created_by_admin_id: null,
      rules_snapshot: userChallenge.rules_snapshot || null,
    },
    { transaction: t },
  );

  return acc;
}

async function createAndAttachMTAccount({
  acc,
  plan,
  orderKey,
  group,
  t,
  platform,
  user,
}) {
  // اگر قبلاً mt_login ثبت شده، دوباره نساز (idempotent)
  if (acc.mt_login) return acc;

  const inPassword = generateMainPassword();
  const mPassword = generateMainPassword();

  console.log("group=>", group);

  const mt = await createTradingAccount({
    order_id: orderKey,
    balance: Number(acc.starting_balance_usd),
    emailuser: 0,

    eod_role: Number(plan.max_daily_drawdown_percent),
    start_balance_role: Number(plan.max_overall_drawdown_percent),

    // طبق صحبت جدید: ریسک شناور از روی پلن
    eod_relative: plan.has_floating_risk
      ? Number(plan.floating_risk_value || 0)
      : 0,

    inPassword,
    mPassword,
    leverge: plan.leverage,
    groupch: group,
    provider: platform,

    email: user?.email,
    first_name: user?.firstname,
    last_name: user?.lastname,

    // risks params
    daily_risk_percent: plan?.max_daily_drawdown_percent,
    overall_risk_percent: plan?.max_overall_drawdown_percent,
    floating_risk_percent: plan?.floating_risk_value || 0,
  });

  if (!mt?.Login && !mt?.login)
    throw Object.assign(new Error("ساخت حساب متاتریدر ناموفق بود"), {
      status: 500,
    });

  await acc.update(
    {
      mt_login: String(mt.Login || mt?.login),
      mt_server: group,
      mt_group: group,
      email: user?.email,
      platform: platform,
      status: "active",
      activated_at: new Date(),
      mt_password: mPassword,
      in_password: inPassword,
    },
    { transaction: t },
  );

  return acc;
}

const { Op } = require("sequelize");
const createTradingAccount = require("../BuyCh/CreateTrainingAccount");

const handelRefralSet = async ({ user, order, t }) => {
  try {
    // فقط وقتی سفارش واقعا پرداخت/تایید شده
    if (!user?.referrer_id) return;
    if (!order?.id) return;

    // اگر وضعیت سفارش داری، این گارد خیلی مهمه:
    // if (order.status !== "paid") return;

    const referrerId = user.referrer_id;

    // 1) پیدا کردن رول درصد
    let rule = await ReferralCommissionRule.findOne({
      where: { referrer_id: referrerId, referred_user_id: user.id },
      transaction: t,
      lock: t?.LOCK?.SHARE,
    });

    if (!rule) {
      rule = await ReferralCommissionRule.findOne({
        where: { referrer_id: referrerId, referred_user_id: null },
        transaction: t,
        lock: t?.LOCK?.SHARE,
      });
    }

    const percent = Number(rule?.percent ?? 7);
    const orderAmount = Number(order.amount_usd);
    if (!Number.isFinite(orderAmount) || orderAmount <= 0) return;

    const commissionAmount = Math.floor((orderAmount * percent) / 100);
    if (commissionAmount <= 0) return;

    // 2) ساخت/پیدا کردن رکورد کمیسیون (ایدِمپوتنت)
    const [commission, createdCommission] =
      await ReferralCommission.findOrCreate({
        where: {
          order_id: order.id,
          referrer_id: referrerId,
          referred_user_id: user.id,
        },
        defaults: {
          order_amount: orderAmount,
          percent,
          commission_amount: commissionAmount,
          status: "approved", // یا pending اگر میخوای بعدا بررسی بشه
        },
        transaction: t,
        lock: t?.LOCK?.UPDATE,
      });

    // اگر قبلا ساخته شده، یعنی قبلا هم باید ولت شارژ شده باشه؛ پس دوباره شارژ نکن
    // (این خط خیلی جلوی دوباره‌واریز رو می‌گیره)
    if (!createdCommission) return commission;

    // 3) ولت رفرر رو با لاک بگیر
    const refWallet = await Wallet.findOne({
      where: { user_id: referrerId },
      transaction: t,
      lock: t?.LOCK?.UPDATE,
    });

    if (!refWallet) {
      // اگر سیستم‌ات اجازه میده، میتونی اینجا ولت بسازی
      // یا throw کنی که دیتای کاربر ناقصه
      throw new Error("Referrer wallet not found");
    }

    // 4) ثبت تراکنش ولت (credit) به صورت ایدمپوتنت
    // بهتره WalletTransaction یک فیلد unique مثل reference_id داشته باشه
    const referenceId = `ref-commission-${commission.id}`; // یونیک

    const [wt, createdWT] = await WalletTransaction.findOrCreate({
      where: {
        wallet_id: refWallet.id,
        reference_id: referenceId, // حتما UNIQUE باشه ایده‌آلش
      },
      defaults: {
        user_id: referrerId,
        wallet_id: refWallet.id,
        type: "refral_deposit", // هر چی استاندارد خودته
        amount: commissionAmount,
        status: "completed", // یا pending
        balance_before: refWallet?.balance,
        balance_after: refWallet?.balance + commissionAmount,
        meta: {
          order_id: order.id,
          referred_user_id: user.id,
          commission_id: commission.id,
          percent,
          order_amount: orderAmount,
        },
      },
      transaction: t,
      lock: t?.LOCK?.UPDATE,
    });

    // اگر تراکنش ولت قبلا بوده، دوباره بالانس رو افزایش نده
    if (!createdWT) return commission;

    // 5) آپدیت بالانس ولت (همون لحظه داخل تراکنش)
    await refWallet.increment(
      { balance: commissionAmount },
      { transaction: t },
    );

    return commission;
  } catch (err) {
    console.log("REFERRAL_CREATE_ERROR =>", err?.message);
    console.log(
      "REFERRAL_CREATE_ERROR_PARENT =>",
      err?.parent?.sqlMessage || err?.parent?.message,
    );
    throw err;
  }
};

/**
 * این تابع “بعد از پرداخت موفق” رو کامل انجام میده.
 * هم برای callback درگاه و هم برای خرید با ولت استفاده میشه.
 */
async function finalizeChallengeAfterPaid({
  orderId,
  trackingCode = null,
  refNum = null,
  user,
  t,
  platform = "ctrader",
  payment_type = "full",
  current_phase_index = 1,
}) {
  // 1) lock payment + idempotency
  // const payment = await lockPaymentByOrderId({ orderId, t });

  // console.log("payment=>>>", payment);

  // if (String(payment.status).toLowerCase() === "paid") {
  //   // قبلا انجام شده
  //   return { alreadyDone: true };
  // }
  // if (
  //   !["pending", "waiting", "confirmed_free"].includes(String(payment.status))
  // ) {
  //   throw Object.assign(new Error("وضعیت تراکنش منتظر پرداخت نیست"), {
  //     status: 400,
  //   });
  // }

  console.log("LOCK ORDER");

  // 2) lock order
  const order = await lockOrderByGatewayOrderId({ orderId, t });

  // if (String(order.status).toLowerCase() === "paid") {
  //   // قبلا انجام شده
  //   return { alreadyDone: true };
  // }
  // if (!["pending"].includes(String(order.status))) {
  //   throw Object.assign(new Error("وضعیت تراکنش منتظر پرداخت نیست"), {
  //     status: 400,
  //   });
  // }

  // 3) lock challenge + plan
  const userChallenge = await lockUserChallengeWithPlan({
    userChallengeId:
      order?.dataValues?.user_challenge_id || order?.user_challenge_id, // همون فیلدی که خودت داری
    t,
  });

  console.log("payment confirmed + order paid", userChallenge);

  // 4) payment confirmed + order paid
  // await payment.update(
  //   { status: "confirmed", provider_payment_id: trackingCode },
  //   { transaction: t },
  // );

  // ⚠️ gateway_order_id نباید عوض شود: کلید پیوند سفارش با Payment و تنها
  // راه پیدا کردن سفارش در کال‌بک‌های تکراری است. قبلاً با trackingCode
  // بازنویسی می‌شد و کال‌بک دوم «سفارشی یافت نشد» می‌گرفت.
  await order.update(
    {
      status: "paid",
      gateway_payment_id: refNum || trackingCode || null,
      paid_at: new Date(),
      meta: { trackingCode, refNum, orderId },
    },
    { transaction: t },
  );

  console.log("ensure account instance exists (phase1)");

  const targetPhaseIndex = current_phase_index;
  // 5) ensure account instance exists (phase1)
  const acc = await getOrCreatePhase1AccountInstance({
    userChallenge,
    t,
    email: user?.email,
    platform,
    phaseIndex: targetPhaseIndex,
    forceCreate: true,
  });

  console.log(" update challenge status");

  const setting = await Setting.findByPk(1, { transaction: t });

  // =========================================================
  // 5) مبلغ Order
  // =========================================================

  const orderAmountUsd = Number(order.final_amount_usd || 0);

  const orderAmountIrr = Number(order.final_amount_irr || 0);

  console.log("ORDER AMOUNT =>", {
    usd: orderAmountUsd,
    irr: orderAmountIrr,
  });

  // =========================================================
  // 9) محاسبه پرداخت
  // =========================================================

  const oldPaidUsd = Number(userChallenge.paid_amount_usd || 0);
  const oldPaidIrr = Number(userChallenge.paid_amount_irr || 0);

  const oldBasePaidUsd = Number(userChallenge.paid_base_amount_usd || 0);

  const oldBasePaidIrr = Number(userChallenge.paid_base_amount_irr || 0);

  const oldInsurancePaidUsd = Number(
    userChallenge.paid_insurance_amount_usd || 0,
  );

  const oldInsurancePaidIrr = Number(
    userChallenge.paid_insurance_amount_irr || 0,
  );

  // مبلغ همین فاکتور
  const currentOrderUsd = Number(order.final_amount_usd || 0);

  const currentOrderIrr = Number(order.final_amount_irr || 0);

  const currentBaseUsd = Number(order.base_amount_usd || 0);

  const currentBaseIrr = Number(order.base_amount_irr || 0);

  const currentInsuranceUsd = Number(order.insurance_amount_usd || 0);

  const currentInsuranceIrr = Number(order.insurance_amount_irr || 0);

  console.log("========== PAYMENT CALC ==========");
  console.log("OLD PAID USD =>", oldPaidUsd);
  console.log("CURRENT ORDER USD =>", currentOrderUsd);

  console.log("OLD PAID IRR =>", oldPaidIrr);
  console.log("CURRENT ORDER IRR =>", currentOrderIrr);

  console.log("OLD BASE USD =>", oldBasePaidUsd);
  console.log("CURRENT BASE USD =>", currentBaseUsd);

  console.log("OLD INSURANCE USD =>", oldInsurancePaidUsd);
  console.log("CURRENT INSURANCE USD =>", currentInsuranceUsd);
  console.log("==================================");

  // مبلغ نهایی پرداخت شده تا این لحظه
  const newPaidUsd = oldPaidUsd + currentOrderUsd;

  const newPaidIrr = oldPaidIrr + currentOrderIrr;

  // مبلغ Base پرداخت شده
  const newBasePaidUsd = oldBasePaidUsd + currentBaseUsd;
  console.log("oldBasePaidUsd=>", oldBasePaidUsd);
  console.log("currentBaseUsd=>", currentBaseUsd);

  const newBasePaidIrr = oldBasePaidIrr + currentBaseIrr;

  // مبلغ Insurance پرداخت شده
  const newInsurancePaidUsd = oldInsurancePaidUsd + currentInsuranceUsd;

  const newInsurancePaidIrr = oldInsurancePaidIrr + currentInsuranceIrr;

  // کل مبلغ سفارش
  const totalPriceUsd = Number(userChallenge.total_price_usd || 0);

  const totalPriceIrr = Number(userChallenge.total_price_irr || 0);

  // مانده
  const newRemainingUsd = Math.max(0, totalPriceUsd - newPaidUsd);

  const newRemainingIrr = Math.max(0, totalPriceIrr - newPaidIrr);

  // وضعیت پرداخت
  const isSecondPayment =
    userChallenge.payment_status === "pending_second_payment";

  const isFullPayment = payment_type === "full";

  const newPaymentStatus =
    isFullPayment || isSecondPayment ? "fully_paid" : "paid_first_payment";

  // وضعیت چالش
  const newStatus =
    targetPhaseIndex === 3 ? "real" : `phase${targetPhaseIndex}`;

  // اطلاعاتی که باید روی UserChallenge ذخیره شود
  const dataUpdateCh = {
    status: newStatus,

    current_phase_index: targetPhaseIndex,

    current_phase_id: userChallenge.current_phase_id,

    current_account_instance_id: acc.id,

    payment_status: newPaymentStatus,

    // مجموع پرداخت‌ها
    paid_amount_usd: newPaidUsd,

    paid_amount_irr: newPaidIrr,

    // باقی‌مانده
    // remaining_amount_usd: newRemainingUsd,

    // remaining_amount_irr: newRemainingIrr,

    // Base
    paid_base_amount_usd: newBasePaidUsd,

    paid_base_amount_irr: newBasePaidIrr,

    // Insurance
    paid_insurance_amount_usd: newInsurancePaidUsd,

    paid_insurance_amount_irr: newInsurancePaidIrr,
  };

  // تاریخ پرداخت
  if (isSecondPayment) {
    dataUpdateCh.second_payment_paid_at = new Date();
  } else if (!userChallenge.first_payment_paid_at) {
    dataUpdateCh.first_payment_paid_at = new Date();
  }

  console.log("FINAL PAYMENT UPDATE =>", dataUpdateCh);

  await userChallenge.update(dataUpdateCh, {
    transaction: t,
  });
  // 7) create MT (idempotent)
  const orderKey = `${orderId}-${refNum || ""}`;

  console.log("STEEEP CREATE MT ACCCOUNT");

  await createAndAttachMTAccount({
    acc,
    plan: userChallenge.ChallengePlan,
    orderKey,
    t,
    group: userChallenge?.ChallengePhase?.group,
    platform,
    user: user,
  });

  console.log("AFTER STEEEP CREATE MT ACCCOUNT");

  // 8) set refral
  await handelRefralSet({ user, order, t });

  return {
    alreadyDone: false,
    userChallenge,
    acc,
    order,
    payment: order,
  };
}

module.exports = { finalizeChallengeAfterPaid };
