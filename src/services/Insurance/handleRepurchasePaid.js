const sequelize = require("../../../db");
const Order = require("../../models/Order");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../models/Challenge/ChallengePhase");
const AccountInstance = require("../../models/Challenge/AccountInstance");
const User = require("../../models/User");

const { INSURANCE_STATUS } = require("./constants");
const generateMainPassword = require("../BuyCh/CreatePassword");
const createTradingAccount = require("../BuyCh/CreateTrainingAccount");

async function getOrCreateAccountInstance({
  userChallenge,
  phaseIndex,
  cycleNo,
  t,
  platform = "mt5",
  adminId,
}) {
  // idempotent
  let acc = await AccountInstance.findOne({
    where: {
      user_challenge_id: userChallenge.id,
      phase_index: phaseIndex,
      cycle_no: cycleNo,
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (acc) return acc;

  // بالانس شروع را از پلن یا اسنپ‌شات/قانون خودت تعیین کن
  // (فعلاً از plan balance استفاده می‌کنیم)
  const startingBalance = Number(userChallenge.ChallengePlan.balance);

  acc = await AccountInstance.create(
    {
      user_id: userChallenge.user_id,
      user_challenge_id: userChallenge.id,
      phase_index: phaseIndex,
      cycle_no: cycleNo,
      platform,
      starting_balance_usd: startingBalance,
      display_balance_usd: startingBalance,
      status: "pending",
      created_by_admin_id: adminId,
      rules_snapshot: userChallenge.rules_snapshot || null,
    },
    { transaction: t },
  );

  return acc;
}

async function provisionMTAndAttach({
  acc,
  userChallenge,
  mtGroup,
  orderKey,
  t,
  platform,
  findUser,
}) {
  // اگر قبلاً ساخته شده، دوباره نساز

  if (acc.mt_login) return acc;

  const plan = userChallenge.ChallengePlan;

  const inPassword = generateMainPassword();
  const mPassword = generateMainPassword();

  const result = await createTradingAccount({
    provider: platform,
    order_id: orderKey,
    balance: Number(acc.starting_balance_usd),
    emailuser: 0,
    eod_role: Number(plan.max_daily_drawdown_percent),
    start_balance_role: Number(plan.max_overall_drawdown_percent),
    eod_relative: plan.has_floating_risk
      ? Number(plan.floating_risk_value || 0)
      : 0,
    inPassword,
    mPassword,
    leverge: plan.leverage,
    groupch: mtGroup,

    // ctrader fileds
    email: findUser?.email,
    first_name: findUser?.firstname,
    last_name: findUser?.lastname,

    // risks params
    daily_risk_percent: plan?.max_daily_drawdown_percent,
    overall_risk_percent: plan?.max_overall_drawdown_percent,
    floating_risk_percent: plan?.floating_risk_value
      ? plan?.floating_risk_value
      : 0,
  });

  console.log(plan?.floating_risk_value ? plan?.floating_risk_value : 0);
  console.log(plan);

  console.log(result);

  if (!result?.Login && !result?.login) {
    const err = new Error("ساخت حساب ناموفق بود");
    err.status = 500;
    throw err;
  }

  await acc.update(
    {
      mt_login: String(result?.Login || result?.login),
      mt_server: mtGroup,
      mt_group: mtGroup,
      email: result?.email || null,
      status: "active",
      activated_at: new Date(),
      mt_password: mPassword,
      in_password: inPassword,
    },
    { transaction: t },
  );

  return acc;
}

const PLATFORM_DEFAULT = "mt5";

/**
 * شماره سایکل بعدی برای یه فاز خاص
 * چون کاربر ممکنه فاز ۲ رو چند بار تکرار کرده باشه
 */
async function getNextCycleNo(userChallengeId, phaseIndex, transaction) {
  const AccountInstance = sequelize.models.AccountInstance;
  const last = await AccountInstance.findOne({
    where: {
      user_challenge_id: userChallengeId,
      phase_index: phaseIndex,
    },
    order: [["cycle_no", "DESC"]],
    attributes: ["cycle_no"],
    transaction,
  });

  return (Number(last?.cycle_no) || 0) + 1;
}

/**
 * پرداخت موفق خرید مجدد بیمه (فاز ۲)
 *
 * @param {object} params
 * @param {number|string} params.orderId
 * @param {string} [params.gatewayOrderId]
 * @param {object} [params.paymentMeta]
 * @param {string} [params.platform]
 * @param {number} [params.adminId]
 */
const handleRepurchasePaid = async ({
  orderId,
  gatewayOrderId = null,
  paymentMeta = {},
  platform = PLATFORM_DEFAULT,
  adminId = null,
  transaction = null, // ⬅️ تراکنش بیرونی رو بگیر
  current_phase_index = 2,
}) => {
  const t = transaction || (await sequelize.transaction());
  const ownTransaction = !transaction; // فقط وقتی خودش ساخته، commit/rollback کن

  console.log("FIND ORDER", orderId);
  try {
    const order = await Order.findOne({
      where: {
        id: orderId,
      },
      transaction: t, // ⬅️ همون تراکنش بیرونی که Order داخلش ساخته شد
      lock: t.LOCK.UPDATE,
    });
    console.log(order);

    if (!order) {
      if (ownTransaction) await t.rollback();
      return { ok: false, reason: "order_not_found" };
    }

    const userChallenge = await UserChallenge.findByPk(
      order.user_challenge_id,
      {
        include: [
          {
            model: ChallengePlan,
            attributes: [
              "id",
              "leverage",
              "balance",
              "has_floating_risk",
              "max_overall_drawdown_percent",
              "max_daily_drawdown_percent",
              "floating_risk_value",
              "challenge_type_id",
            ],
          },
          { model: ChallengePhase, attributes: ["id", "group", "phase_index"] },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      },
    );

    if (!userChallenge) {
      if (ownTransaction) await t.rollback();
      return { ok: false, reason: "user_challenge_not_found" };
    }

    const user = await User.findByPk(userChallenge.user_id, {
      attributes: ["id", "firstname", "lastname", "email"],
      transaction: t,
    });

    // بیمه رو بیاثر کن + برگردون به فاز ۲
    await userChallenge.update(
      {
        insurance_status: INSURANCE_STATUS.USED,
        has_insurance: false,
        current_phase_index,
        challenge_phase: null,
        status: "phase2",
      },
      { transaction: t },
    );

    const findGroup = await ChallengePhase.findOne({
      where: {
        challenge_plan_id: userChallenge.challenge_plan_id,
        phase_index: 2,
      },
      attributes: ["id", "group"],
      transaction: t,
    });

    const cycleNo = await getNextCycleNo(userChallenge.id, 2, t);

    const acc = await getOrCreateAccountInstance({
      userChallenge,
      phaseIndex: 2,
      cycleNo,
      t,
      platform,
      adminId: adminId ?? order.admin_id ?? null,
      findUser: user,
    });

    const orderKey = `INS-REBUY-${userChallenge.id}-2-${Date.now()}`;
    await provisionMTAndAttach({
      acc,
      userChallenge,
      mtGroup: findGroup?.group,
      orderKey,
      t,
      platform,
      findUser: user,
    });

    // سفارش رو پرداختشده علامت بزن
    await order.update(
      {
        status: "paid",
        gateway_order_id: gatewayOrderId ?? order.gateway_order_id,
        paid_at: new Date(),
        meta: {
          ...(order.meta ?? {}),
          payment: paymentMeta,
        },
      },
      { transaction: t },
    );

    if (ownTransaction) await t.commit();

    return {
      ok: true,
      user_challenge_id: userChallenge.id,
      account_instance_id: acc.id,
      phase_index: current_phase_index,
      cycle_no: cycleNo,
      mt_login: acc.mt_login,
      mt_server: acc.mt_server,
    };
  } catch (err) {
    if (ownTransaction) await t.rollback();
    throw err;
  }
};

module.exports = handleRepurchasePaid;
