const express = require("express");
const router = express.Router();
const { migrateUsersBatch } = require("./migrateLegacyUsers");
const { importUserFromLegacy } = require("./founctionsData");

router.post("/users", migrateUsersBatch);

/**
 * محافظت ساده با یه secret key ثابت (env variable).
 * وردپرس باید این هدر رو با هر request بفرسته:
 *   x-legacy-import-key: <همون مقدار LEGACY_IMPORT_SECRET>
 *
 * بدون این، هر کسی که آدرس endpoint رو پیدا کنه می‌تونه کاربر جعلی بسازه.
 */
function requireLegacySecret(req, res, next) {
  const provided = req.headers["x-legacy-import-key"];
  if (!provided || provided !== process.env.LEGACY_IMPORT_SECRET) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
}

/**
 * ورودی می‌تونه یکی از این دو حالت باشه:
 *   1) یک آبجکت تنها: { user: {...}, challenges: [...] }
 *   2) آرایه‌ای از همون آبجکت‌ها: [ { user, challenges }, { user, challenges }, ... ]
 * این کار بهت اجازه می‌ده هم تک‌کاربر تست کنی، هم بعداً batch/bulk بفرستی.
 */
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

module.exports = router;

/**
 * نمونه فراخوانی از سمت وردپرس (تک کاربر):
 *
 * POST /users-import
 * Headers: { "Content-Type": "application/json", "x-legacy-import-key": "..." }
 * Body: { "user": {...}, "challenges": [...] }   <-- همون sample-legacy-import-payload.json
 *
 * نمونه batch (چند کاربر با هم):
 * Body: [ { "user": {...}, "challenges": [...] }, { "user": {...}, "challenges": [...] } ]
 */

module.exports = router;
