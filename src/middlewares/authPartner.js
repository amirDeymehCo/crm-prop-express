// middlewares/authPartner.js
const crypto = require("crypto");

/**
 * احراز هویت سرویس‌به‌سرویس برای API هایی که پنل PHP صدا می‌زند.
 *
 * کلید در هدر X-API-Key فرستاده می‌شود (همان الگویی که سرویس تحلیل متاتریدر
 * استفاده می‌کند). مقایسه با timingSafeEqual انجام می‌شود تا کلید از روی
 * زمان پاسخ قابل حدس زدن نباشد.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));

  // طول‌های نابرابر را هم باید در زمان ثابت رد کنیم
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

const authPartner = (req, res, next) => {
  const expected = process.env.PARTNER_API_KEY;

  if (!expected) {
    console.error("PARTNER_API_KEY تنظیم نشده است؛ مسیر partner غیرفعال است");

    return res.status(503).json({
      message: "سرویس در دسترس نیست",
      data: null,
    });
  }

  const provided =
    req.headers["x-api-key"] ||
    (typeof req.headers["authorization"] === "string" &&
    req.headers["authorization"].startsWith("Bearer ")
      ? req.headers["authorization"].slice(7)
      : null);

  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({
      message: "کلید دسترسی معتبر نیست",
      data: null,
    });
  }

  req.partner = { name: "php-crm" };

  return next();
};

module.exports = authPartner;
