// services/sessionStatus.service.js
const User = require("../../models/User");

// فیلدهایی که مجازیم به پروژهٔ دیگه برگردونیم
const PUBLIC_FIELDS = [
  "id",
  "firstname",
  "lastname",
  "username",
  "email",
  "mobile",
  "avatar",
];

// آیا «لاگین بودن» باید به تایید شدن اکانت هم وابسته باشه؟
const REQUIRE_APPROVED = process.env.SESSION_REQUIRE_APPROVED === "true";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function getSessionStatus(identifier = {}) {
  const { mobile } = identifier;

  if (!mobile) {
    throw badRequest("ارسال شماره موبایل اجباری است.");
  }

  const where = {};
  where.mobile = String(mobile).trim();

  // توکن رو از DB می‌خونیم چون برای چک نیاز داریم، ولی هیچ‌وقت برنمی‌گردونیم
  const user = await User.findOne({
    where,
    attributes: [...PUBLIC_FIELDS, "refresh_token", "refresh_token_expires_at"],
  });

  if (!user) {
    return { is_logged_in: false, user: null, session_expires_at: null };
  }

  const now = new Date();
  const hasToken = !!user.refresh_token && !!user.refresh_token_expires_at;
  const notExpired = hasToken && user.refresh_token_expires_at > now;
  const accountActive = user.status === "approved";

  const is_logged_in = hasToken && notExpired && accountActive;

  // خروجی امن: فقط فیلدهای مجاز
  const safeUser = {};
  for (const f of PUBLIC_FIELDS) safeUser[f] = user[f];

  return {
    is_logged_in,
    session_expires_at: is_logged_in ? user.refresh_token_expires_at : null,
    user: safeUser,
  };
}

module.exports = { getSessionStatus };
