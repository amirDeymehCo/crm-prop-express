// utils/sheba.js
// اعتبارسنجی شماره شبا (IBAN ایران) با الگوریتم استاندارد ISO 7064 MOD-97-10
//
// فرمت شبا: IR + ۲ رقم چک + ۲۲ رقم (کد بانک + شناسه حساب) = ۲۶ کاراکتر
// چون عدد ۲۴ رقمی از Number.MAX_SAFE_INTEGER بزرگ‌تر است، باقی‌مانده را
// رقم‌به‌رقم حساب می‌کنیم تا دقت از دست نرود.

const SHEBA_LENGTH = 26;

/**
 * ورودی کاربر را به شکل استاندارد درمی‌آورد: حذف فاصله/خط تیره، تبدیل ارقام
 * فارسی و عربی به لاتین، بزرگ کردن حروف و اضافه کردن پیشوند IR اگر نبود.
 */
const normalizeSheba = (input) => {
  if (input === null || input === undefined) return "";

  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

  let value = String(input)
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[\s\-_.]/g, "")
    .toUpperCase();

  // کاربر ممکن است فقط ۲۴ رقم را وارد کند
  if (/^\d{24}$/.test(value)) value = `IR${value}`;

  return value;
};

/** باقی‌مانده تقسیم یک رشته‌ی عددی بر ۹۷ (بدون سرریز عددی) */
const mod97 = (numericString) => {
  let remainder = 0;

  for (const char of numericString) {
    remainder = (remainder * 10 + Number(char)) % 97;
  }

  return remainder;
};

/**
 * آیا شبا معتبر است؟ ورودی باید از قبل normalize شده باشد یا خودِ تابع
 * normalize می‌کند.
 */
const isValidSheba = (input) => {
  const sheba = normalizeSheba(input);

  if (sheba.length !== SHEBA_LENGTH) return false;
  if (!/^IR\d{24}$/.test(sheba)) return false;

  // چهار کاراکتر اول به انتها منتقل می‌شود و حروف با عدد جایگزین می‌شوند
  // (I = 18، R = 27 بر اساس A=10)
  const rearranged = sheba.slice(4) + "1827" + sheba.slice(2, 4);

  return mod97(rearranged) === 1;
};

/** کد بانک (دو رقم بعد از رقم‌های چک) — برای نمایش/لاگ */
const getShebaBankCode = (input) => {
  const sheba = normalizeSheba(input);

  return isValidSheba(sheba) ? sheba.slice(4, 7) : null;
};

/** نمایش ماسک‌شده برای لاگ و لیست‌ها: IR12 **** **** 3456 */
const maskSheba = (input) => {
  const sheba = normalizeSheba(input);

  if (sheba.length !== SHEBA_LENGTH) return "";

  return `${sheba.slice(0, 4)}${"*".repeat(18)}${sheba.slice(-4)}`;
};

module.exports = {
  SHEBA_LENGTH,
  normalizeSheba,
  isValidSheba,
  getShebaBankCode,
  maskSheba,
};
