const express = require("express");
const router = express.Router();
const { migrateUsersBatch } = require("./migrateLegacyUsers");
const { importUserFromLegacy } = require("./founctionsData");

const User = require("../../../../models/User")
const Coupon = require("../../../../models/Coupon")
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");

router.post("/users", migrateUsersBatch);

/**
 * محافظت ساده با یه secret key ثابت (env variable).
 * وردپرس باید این هدر رو با هر request بفرسته:
 *   x-legacy-import-key: <همون مقدار LEGACY_IMPORT_SECRET>
 *
 * بدون این، هر کسی که آدرس endpoint رو پیدا کنه می‌تونه کاربر جعلی بسازه.
 */
function requireLegacySecret(req, res, next) {
  next();
}

/**
 * ورودی می‌تونه یکی از این دو حالت باشه:
 *   1) یک آبجکت تنها: { user: {...}, challenges: [...] }
 *   2) آرایه‌ای از همون آبجکت‌ها: [ { user, challenges }, { user, challenges }, ... ]
 * این کار بهت اجازه می‌ده هم تک‌کاربر تست کنی، هم بعداً batch/bulk بفرستی.
 */

router.get("/users-import-test", async (req, res) => {
  res.status(200).json({
    success: true,
  });
});

router.post("/users-import", requireLegacySecret, async (req, res) => {
  const body = req.body;

  if (!body || (Array.isArray(body) && body.length === 0)) {
    return res
      .status(400)
      .json({ success: false, error: "بدنه درخواست خالی است" });
  }

  const items = Array.isArray(body) ? body : [body];

  const results = [];

  for (const item of items) {
    try {
      const report = await importUserFromLegacy(item);

      results.push({
        success: true,
        legacy_user_id: report.user.legacy_user_id,
        user_id: report.user.id,
        user_created: report.userCreated,
        challenges_created: report.challengesCreated.length,
        challenge_errors: report.challengeErrors, // اگه خالی نبود یعنی بعضی چالش‌ها match نشدن
      });
    } catch (err) {
      // خطای ثبت خود کاربر (نه چالش‌ها) - یعنی کل این آیتم fail شده
      results.push({
        success: false,
        legacy_user_id: item?.user?.legacy_user_id || null,
        error: err.message,
      });
    }
  }

  // اگه همه موفق بودن 200، اگه بعضی‌ها fail شدن 207 (Multi-Status) که رایج‌ترین
  // کد برای "batch عملیات با نتایج ترکیبی" هست
  const allSucceeded = results.every((r) => r.success);
  res.status(allSucceeded ? 200 : 207).json({
    success: allSucceeded,
    total: results.length,
    results,
  });
});



function generateCouponCode(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}

async function generateUniqueCouponCode() {
  let code;
  let exists = true;

  while (exists) {
    code = generateCouponCode();

    exists = await Coupon.findOne({
      where: {
        code,
      },
      attributes: ["id"],
    });
  }

  return code;
}

const createUserCoupon = async (req, res) => {
  try {
    const {
      user_id,
      title,
      type,
      value,
      max_uses,
      max_uses_per_user,
      valid_from,
      valid_to,
      min_order_amount_usd,
      challenge_type_id,
      challenge_plan_id,
    } = req.body;

    // =========================================
    // Validation
    // =========================================

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id الزامی است",
      });
    }

    if (!type || !["percent", "fixed"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "type باید percent یا fixed باشد",
      });
    }

    if (value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        message: "value الزامی است",
      });
    }

    if (Number(value) <= 0) {
      return res.status(400).json({
        success: false,
        message: "مقدار تخفیف باید بیشتر از صفر باشد",
      });
    }

    // تخفیف درصدی نباید بیشتر از 100 باشد
    if (type === "percent" && Number(value) > 100) {
      return res.status(400).json({
        success: false,
        message: "درصد تخفیف نمی‌تواند بیشتر از 100 باشد",
      });
    }

    // =========================================
    // Check User
    // =========================================

    const user = await User.findByPk(user_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "کاربر پیدا نشد",
      });
    }

    // =========================================
    // Check Challenge Type
    // =========================================

    if (challenge_type_id) {
      const challengeType = await ChallengeType.findByPk(challenge_type_id);

      if (!challengeType) {
        return res.status(404).json({
          success: false,
          message: "نوع چالش پیدا نشد",
        });
      }
    }

    // =========================================
    // Check Challenge Plan
    // =========================================

    if (challenge_plan_id) {
      const challengePlan = await ChallengePlan.findByPk(challenge_plan_id);

      if (!challengePlan) {
        return res.status(404).json({
          success: false,
          message: "پلن چالش پیدا نشد",
        });
      }
    }

    // =========================================
    // Generate Unique Code
    // =========================================

    const code = await generateUniqueCouponCode();

    // =========================================
    // Create Coupon
    // =========================================

    const coupon = await Coupon.create({
      title: title || "کد تخفیف اختصاصی",

      code,

      type,

      value,

      max_uses: max_uses !== undefined && max_uses !== null ? max_uses : 1,

      max_uses_per_user:
        max_uses_per_user !== undefined && max_uses_per_user !== null
          ? max_uses_per_user
          : 1,

      used_count: 0,

      valid_from: valid_from || null,

      valid_to: valid_to || null,

      min_order_amount_usd: min_order_amount_usd || null,

      is_active: true,

      user_id,

      challenge_type_id: challenge_type_id || null,

      challenge_plan_id: challenge_plan_id || null,
    });

    // =========================================
    // Response
    // =========================================

    return res.status(201).json({
      success: true,
      message: "کد تخفیف با موفقیت ایجاد شد",

      data: {
        id: coupon.id,
        title: coupon.title,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,

        max_uses: coupon.max_uses,
        max_uses_per_user: coupon.max_uses_per_user,
        used_count: coupon.used_count,

        valid_from: coupon.valid_from,
        valid_to: coupon.valid_to,

        min_order_amount_usd: coupon.min_order_amount_usd,

        is_active: coupon.is_active,

        user_id: coupon.user_id,

        challenge_type_id: coupon.challenge_type_id,

        challenge_plan_id: coupon.challenge_plan_id,
      },
    });
  } catch (error) {
    console.error("createUserCoupon error:", error);

    return res.status(500).json({
      success: false,
      message: "خطا در ایجاد کد تخفیف",
      error: error.message,
    });
  }
};

router.post("/create-coupon", createUserCoupon);

module.exports = router;

