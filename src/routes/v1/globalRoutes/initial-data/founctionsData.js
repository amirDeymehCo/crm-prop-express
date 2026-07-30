/**
 * syncUserToLegacy.js
 *
 * هدف: ارسال اطلاعات یک کاربر + لیست چالش‌هایی که خریده، به سیستم قدیمی (وردپرس)
 * از طریق POST — بدون اتکا به ID های داخلی دیتابیس فعلی (Sequelize).
 *
 * چرا بدون ID؟
 * چون سیستم مقصد (وردپرس) هیچ تضمینی نداره که auto-increment id هاش با
 * id های این دیتابیس یکی باشه. اگه با id بفرستیم و اونجا هم یه ChallengeType/Plan
 * با همون id ولی محتوای متفاوت وجود داشته باشه، match اشتباه می‌خوره و کاربر با
 * پلن غلط ست میشه. به‌جاش با فیلدهای خوانا (name / title / balance / phase_index)
 * می‌فرستیم تا برنامه‌نویس اونطرف خودش با شرط WHERE name = '...' مچ کنه.
 *
 * رمز عبور:
 * چون الگوریتم هش بین دو سیستم فرق داره (وردپرس معمولاً phpass/wp_hash_password،
 * اینجا bcrypt)، فیلد password همیشه خالی فرستاده میشه. کاربر باید یا reset
 * password کنه، یا اگه هش قدیمی رو داری، جدا (offline) migrate کنی، نه از این مسیر.
 */

const axios = require("axios");
const sequelize = require("../../../../../db");
const crypto = require("crypto");

const User = require("../../../../models/User");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../../../models/Challenge/ChallengePhase");
const AccountInstance = require("../../../../models/Challenge/AccountInstance");

function generateUnusablePassword() {
  // 32 بایت رندوم -> کاربر هرگز این رو نمی‌بینه، فقط باید ریست کنه
  return crypto.randomBytes(32).toString("hex");
}

/**
 * User رو با legacy_user_id پیدا می‌کنه، اگه نبود می‌سازتش.
 * این idempotent هست: اگه همین payload دوباره POST بشه، کاربر تکراری ساخته نمیشه.
 */
async function findOrCreateUser(userPayload, transaction) {
  const { legacy_user_id, source_system } = userPayload;

  if (!legacy_user_id) {
    throw new Error(
      "legacy_user_id الزامی است - بدون این نمی‌شه idempotent کار کرد",
    );
  }

  const existing = await User.findOne({
    where: { legacy_user_id },
    transaction,
  });

  if (existing) {
    return { user: existing, created: false };
  }

  const user = await User.create(
    {
      firstname: userPayload.firstname,
      lastname: userPayload.lastname,
      username: userPayload.username || null,
      email: userPayload.email,
      mobile: userPayload.mobile,
      verify_mobile: userPayload.verify_mobile || false,
      password: "", // هش میشه، ولی قابل استفاده نیست
      status: userPayload.status || "approved",
      kyc_status: userPayload.kyc_status || "not_sended",
      legacy_user_id,
      source_system: source_system || "wordpress",
    },
    { transaction },
  );

  return { user, created: true };
}

/**
 * یک آیتم چالش (به فرمت خروجی که قبلاً طراحی کردیم) رو resolve و ثبت می‌کنه.
 * اگه ChallengeType/Plan/Phase پیدا نشه، خطا throw می‌کنه (توسط caller مدیریت میشه).
 */
async function createSingleChallenge(userId, challengeData, transaction) {
  const {
    challenge_type_name,
    plan_title,
    plan_balance,
    current_phase_index,
    status,
    platform,
    funded_cycle_count,
    started_at,
    ended_at,
    final_price_usd,
    current_account,
  } = challengeData;

  // --- resolve با نام، نه با id ---
  const challengeType = await ChallengeType.findOne({
    where: { name: challenge_type_name },
    transaction,
  });
  if (!challengeType) {
    throw new Error(`ChallengeType با نام "${challenge_type_name}" پیدا نشد`);
  }

  const challengePlan = await ChallengePlan.findOne({
    where: {
      challenge_type_id: challengeType.id,
      title: plan_title,
      balance: plan_balance,
    },
    transaction,
  });
  if (!challengePlan) {
    throw new Error(
      `ChallengePlan با title="${plan_title}" balance=${plan_balance} زیر نوع "${challenge_type_name}" پیدا نشد`,
    );
  }

  const challengePhase = await ChallengePhase.findOne({
    where: {
      challenge_plan_id: challengePlan.id,
      phase_index: current_phase_index,
    },
    transaction,
  });
  if (!challengePhase) {
    throw new Error(
      `ChallengePhase با phase_index=${current_phase_index} برای این پلن پیدا نشد`,
    );
  }

  // قیمت نهایی رو یا از داده ورودی می‌گیریم یا فال‌بک به قیمت فعلی پلن
  const priceUsd = final_price_usd ?? challengePlan.price_usd;

  const userChallenge = await UserChallenge.create(
    {
      user_id: userId,
      challenge_type_id: challengeType.id,
      challenge_plan_id: challengePlan.id,
      current_phase_id: challengePhase.id,
      current_phase_index,
      status: status || "pending_payment",
      platform: platform || "mt5",
      funded_cycle_count: funded_cycle_count || 0,
      started_at: started_at || null,
      ended_at: ended_at || null,
      price_usd: priceUsd,
      discount_usd: 0,
      final_price_usd: priceUsd,
      // اسنپ‌شات قوانین رو از پلن/فاز فعلی می‌سازیم چون داده تاریخی دقیق‌تر
      // از سیستم قدیمی معمولاً در دسترس نیست
      rules_snapshot: {
        plan: {
          profit_share_percent: challengePlan.profit_share_percent,
          max_daily_drawdown_percent: challengePlan.max_daily_drawdown_percent,
          max_overall_drawdown_percent:
            challengePlan.max_overall_drawdown_percent,
        },
        phase: {
          max_daily_drawdown_percent: challengePhase.max_daily_drawdown_percent,
          max_overall_drawdown_percent:
            challengePhase.max_overall_drawdown_percent,
          profit_target_percent: challengePhase.profit_target_percent,
        },
        imported_from: "legacy_wordpress",
      },
    },
    { transaction },
  );

  // اگه اطلاعات اکانت فعلی هم اومده، AccountInstance بساز و بهش وصلش کن
  if (current_account) {
    const accountInstance = await AccountInstance.create(
      {
        user_id: userId,
        user_challenge_id: userChallenge.id,
        phase_index: current_phase_index,
        cycle_no: current_account.cycle_no || 1,
        platform: current_account.platform || platform || "mt5",
        status: current_account.status || "active",
        starting_balance_usd: challengePlan.balance,

        /// amir
        platform_login: current_account.platform_login || null,
        mt_login: current_account.platform_login || null,
        mt_server: current_account.platform || null,
        in_password: current_account.in_password || null,
        mt_password: current_account.mt_password || null,
        email: current_account.email || null,
      },
      { transaction },
    );

    userChallenge.current_account_instance_id = accountInstance.id;
    await userChallenge.save({ transaction });
  }

  return userChallenge;
}

/**
 * تابع اصلی: کاربر رو ثبت می‌کنه، بعد چالش‌هاش رو یکی‌یکی می‌سازه.
 * اگه یک چالش match نشه، کل عملیات fail نمیشه - فقط توی گزارش خطا ثبت میشه
 * و بقیه چالش‌ها همچنان ساخته میشن.
 *
 * @param {object} payload - { user: {...}, challenges: [...] }
 * @returns {object} گزارش کامل: کاربر ساخته‌شده/موجود + چالش‌های موفق + خطاها
 */
async function importUserFromLegacy(payload) {
  const { user: userPayload, challenges = [] } = payload;

  if (!userPayload) {
    throw new Error("فیلد user در payload الزامی است");
  }

  const result = {
    user: null,
    userCreated: false,
    challengesCreated: [],
    challengeErrors: [],
  };

  // --- مرحله ۱: ثبت کاربر (در تراکنش خودش) ---
  const userTransaction = await sequelize.transaction();
  let user;
  try {
    const { user: u, created } = await findOrCreateUser(
      userPayload,
      userTransaction,
    );
    await userTransaction.commit();
    user = u;
    result.user = user;
    result.userCreated = created;
  } catch (err) {
    await userTransaction.rollback();
    throw new Error(`ثبت کاربر ناموفق بود: ${err.message}`);
  }

  // --- مرحله ۲: ثبت هر چالش، جدا از هم (خطای یکی بقیه رو متوقف نمی‌کنه) ---
  for (const challengeData of challenges) {
    const challengeTx = await sequelize.transaction();
    try {
      const uc = await createSingleChallenge(
        user.id,
        challengeData,
        challengeTx,
      );
      await challengeTx.commit();
      result.challengesCreated.push(uc);
    } catch (err) {
      await challengeTx.rollback();
      result.challengeErrors.push({
        input: challengeData,
        error: err.message,
      });
    }
  }

  return result;
}

module.exports = {
  importUserFromLegacy,
  findOrCreateUser,
  createSingleChallenge,
};

/**
 * نمونه استفاده (مثلاً داخل یک route handler که وردپرس بهش POST می‌کنه):
 *
 * router.post("/legacy/import-user", async (req, res) => {
 *   try {
 *     const report = await importUserFromLegacy(req.body);
 *     res.json({
 *       success: true,
 *       user_id: report.user.id,
 *       legacy_user_id: report.user.legacy_user_id,
 *       user_created: report.userCreated,
 *       challenges_created: report.challengesCreated.length,
 *       challenge_errors: report.challengeErrors, // اگه خالی نبود یعنی بعضی چالش‌ها match نشدن
 *     });
 *   } catch (err) {
 *     res.status(400).json({ success: false, error: err.message });
 *   }
 * });
 *
 * نکته مهم: فیلد UserChallenge فعلاً هیچ "legacy_challenge_id" نداره، پس اگه
 * دقیقاً همین payload دوبار POST بشه، برای کاربر یکی هست (idempotent) ولی
 * چالش‌ها ممکنه تکراری ساخته بشن. اگه این ریسک واقعیه، پیشنهاد می‌کنم یه ستون
 * legacy_challenge_id (nullable, unique) به مدل UserChallenge اضافه کنی.
 */
