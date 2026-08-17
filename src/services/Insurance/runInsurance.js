const { INSURANCE, INSURANCE_PHASE, INSURANCE_STATUS } = require("./constants");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const InsuranceEvent = require("../../models/Challenge/HistoryChallenge");
const Order = require("../../models/Order");
const {
  round2,
  getPaidAmountUSD,
  creditWalletUSD,
  hasWithdrawalFromChallenge,
} = require("./helpers");
const sequelize = require("../../../db");

// لاگ رخداد بیمه برای ممیزی و جلوگیری از اجرای دوباره
async function logInsuranceEvent({
  userChallengeId,
  adminId = null,
  type,
  title = "پرداخت بیمه",
  transaction,
}) {
  if (!InsuranceEvent) return; // اگه مدل رو نساختی، لاگ نکن
  await InsuranceEvent.create(
    {
      user_challenge_id: userChallengeId,
      admin_id: adminId,
      type,
      title,
    },
    { transaction },
  );
}

/**
 * اعمال بیمه‌ی فاز ۱: برگشت ۳۰٪ مبلغ پرداختی به ولت
 */
async function applyPhase1Refund({
  userChallenge,
  user,
  paidAmount,
  adminId,
  transaction,
}) {
  const refund = Number(paidAmount) * Number(INSURANCE.PHASE1_REFUND_PERCENT);
  await creditWalletUSD({
    userId: userChallenge.user_id,
    amountUsd: refund,
    description: `بازگشت ۳۰٪ بیمه چالش (فاز ۱) - چالش #${userChallenge.id}`,
    adminId,
    transaction,
  });

  // بیمه مصرف شد
  await userChallenge.update(
    { insurance_status: INSURANCE_STATUS.USED },
    { transaction },
  );

  await logInsuranceEvent({
    userChallengeId: userChallenge.id,
    adminId,
    type: "insurance_paid",
    title: `پرداخت بیمه مرحله اول به مبلغ ${refund?.toLocaleString()} دلار`,
    transaction,
  });

  return { applied: true, type: "phase1_wallet_refund", refund };
}

/**
 * اعمال بیمه‌ی فاز ۲:
 * - ساخت سفارش پرداخت مجدد بدون هزینه‌ی بیمه (۷۰٪ مبلغ قبلی)
 * - اکانت جدید بعد از پرداخت موفق ساخته می‌شه (نه همین الان)
 */
async function applyPhase2Repurchase({
  userChallenge,
  paidAmount,
  adminId,
  transaction,
}) {
  const insuranceFee = paidAmount * INSURANCE.PHASE2_INSURANCE_FEE_PERCENT;
  const repurchaseAmount = Number(paidAmount - insuranceFee)?.toLocaleString();

  console.log("AMIW@@@@@@@@@@@@@@@@@@@@@");

  await userChallenge.update(
    {
      insurance_status: INSURANCE_STATUS.PENDING_REPURCHASE,
      status: "pending_payment_insurance",
    },
    { transaction },
  );

  console.log("AMIWrrrrrrrrrrrrrrrr");

  await logInsuranceEvent({
    userChallengeId: userChallenge.id,
    adminId,
    type: "insurance_paid_phase2",
    title: `ساخت سفارش پرداخت مجدد بیمه مرحله دوم به مبلغ ${repurchaseAmount} دلار`,
    transaction,
  });

  return {
    applied: true,
    type: "insurance_paid_phase2",
    orderId: userChallenge?.order?.id,
    repurchaseAmount,
    insuranceFee,
  };
}

/**
 * اعمال بیمه‌ی فاز ۳:
 * - اگه برداشت نداشته: ۵۰٪ به ولت
 * - اگه برداشت داشته: غیرفعال
 */
async function applyPhase3Refund({
  userChallenge,
  user,
  paidAmount,
  adminId,
  transaction,
}) {
  const hasWithdrawal = hasWithdrawalFromChallenge(userChallenge);

  if (hasWithdrawal) {
    // برداشت داشته → بیمه غیرفعال می‌شه
    await userChallenge.update(
      { insurance_status: INSURANCE_STATUS.CANCELLED },
      { transaction },
    );

    await logInsuranceEvent({
      userId: user?.id ?? userChallenge.user_id,
      userChallengeId: userChallenge.id,
      adminId,
      type: "insurance_paid_phase3",
      title: `بیمه مرحله ۳ غیرفعال شد (برداشت داشته)`,
      transaction,
    });

    return {
      applied: true,
      type: "insurance_paid_phase3",
      refund: 0,
    };
  }

  // برداشت نداشته → ۵۰٪ به ولت
  const refund = paidAmount * INSURANCE.PHASE3_REFUND_PERCENT;

  await creditWalletUSD({
    userId: userChallenge.user_id,
    amountUsd: refund,
    description: `بازگشت ۵۰٪ بیمه چالش (فاز ۳/ریل) - چالش #${userChallenge.id}`,
    adminId,
    transaction,
  });

  await userChallenge.update(
    { insurance_status: INSURANCE_STATUS.USED },
    { transaction },
  );

  await logInsuranceEvent({
    userChallengeId: userChallenge.id,
    adminId,
    type: "phase3_wallet_refund",
    title: `پرداخت بیمه مرحله سوم به مبلغ ${refund?.toLocaleString()} دلار`,
    transaction,
  });

  return { applied: true, type: "phase3_wallet_refund", refund };
}

/**
 * ورودی اصلی بیمه
 *
 * @param {object} params
 * @param {object} params.userChallenge  ← نمونه UserChallenge (قفل‌شده)
 * @param {object} params.user           ← اطلاعات کاربر (اختیاری)
 * @param {number} [params.adminId]      ← ادمین انجام‌دهنده
 * @param {string} [params.platform]     ← mt5 | ctrader
 * @param {object} [params.transaction]  ← تراکنش Sequelize (توصیه می‌شه پاس بدی)
 * @param {number} [params.userChallengeId] ← اگه userChallenge پاس نداده باشی
 */
const RunInsurance = async ({
  userChallenge,
  user,
  adminId = null,
  platform = "ctrader",
  transaction,
  userChallengeId,
  repurchaseReturnUrl = null,
}) => {
  let ownTransaction = false;

  // اگه تراکنش از بیرون نیومده باشه، خودمون می‌سازیم
  if (!transaction) {
    transaction = await sequelize.transaction();
    ownTransaction = true;
  }

  try {
    // اگه خود شیء پاس نشده، از دیتابیس با قفل بخون
    if (!userChallenge && userChallengeId) {
      userChallenge = await UserChallenge.findByPk(userChallengeId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
    }

    if (!userChallenge) {
      throw new Error("UserChallenge برای اعمال بیمه پیدا نشد");
    }

    // ─────────────────────────────
    // Guard ها (ایمنی و idempotency)
    // ─────────────────────────────
    if (!userChallenge.has_insurance) {
      return { applied: false, reason: "no_insurance" };
    }

    if (
      [INSURANCE_STATUS.USED, INSURANCE_STATUS.CANCELLED].includes(
        userChallenge.insurance_status,
      )
    ) {
      return { applied: false, reason: "insurance_already_consumed" };
    }

    if (userChallenge.status !== "closed") {
      return { applied: false, reason: "challenge_not_closed" };
    }

    console.log("BEFORE AMOUNT");

    const paidAmount = await getPaidAmountUSD(userChallenge, transaction);

    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return { applied: false, reason: "no_paid_amount" };
    }

    const phaseIndex = Number(userChallenge.current_phase_index);
    let result;

    console.log("phaseIndex=>", phaseIndex);
    console.log("AMIR+>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");

    switch (phaseIndex) {
      case INSURANCE_PHASE.PHASE_1:
        result = await applyPhase1Refund({
          userChallenge,
          user,
          paidAmount,
          adminId,
          transaction,
        });
        break;

      case INSURANCE_PHASE.PHASE_2:
        result = await applyPhase2Repurchase({
          userChallenge,
          user,
          paidAmount,
          adminId,
          transaction,
          repurchaseReturnUrl,
          platform,
        });
        break;

      case INSURANCE_PHASE.REAL:
        result = await applyPhase3Refund({
          userChallenge,
          user,
          paidAmount,
          adminId,
          transaction,
        });
        break;

      default:
        result = { applied: false, reason: "unknown_phase" };
    }

    if (ownTransaction) {
      await transaction.commit();
    }

    return result;
  } catch (err) {
    if (ownTransaction) {
      await transaction.rollback();
    }

    console.log(err);

    throw err;
  }
};

module.exports = RunInsurance;
