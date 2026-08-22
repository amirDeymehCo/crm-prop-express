function normalizeMobile(value) {
  const input = String(value || "").trim();

  // تبدیل اعداد فارسی و عربی به انگلیسی
  const normalized = input
    .replace(/[۰-۹]/g, (char) => "۰۱۲۳۴۵۶۷۸۹".indexOf(char))
    .replace(/[٠-٩]/g, (char) => "٠١٢٣٤٥٦٧٨٩".indexOf(char))
    .replace(/\s|-/g, "");

  // +989123456789 -> 09123456789
  if (/^\+989\d{9}$/.test(normalized)) {
    return `0${normalized.slice(3)}`;
  }

  // 989123456789 -> 09123456789
  if (/^989\d{9}$/.test(normalized)) {
    return `0${normalized.slice(2)}`;
  }

  return normalized;
}

function isIranianMobile(value) {
  const mobile = normalizeMobile(value);
  return /^09\d{9}$/.test(mobile);
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);

  // برای تشخیص اولیه کافی است؛ اعتبار واقعی را با ارسال OTP تأیید می‌کنیم.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  normalizeMobile,
  isIranianMobile,
  normalizeEmail,
  isValidEmail,
};
