// وضعیت‌های رکورد بازیابی
const RECOVERY_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

// وضعیت اطلاع‌رسانی به سرویس PHP
const CALLBACK_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  SKIPPED: "skipped",
};

// نوع Order ای که برای بازیابی ساخته می‌شود
const RECOVERY_ORDER_TYPE = "challenge_recovery";

// وضعیتی که «رد شده» محسوب می‌شود
const RECOVERABLE_CHALLENGE_STATUS = "closed";

/**
 * آیا چالش حتماً باید در پنل ما "closed" باشد تا بتوان برایش فاکتور بازیابی زد؟
 *
 * ⚠️ فعلاً false است، به درخواست تیم: ممکن است چالشی سمت cTrader رد شده باشد
 * ولی در پنل ما هنوز به closed تغییر نکرده باشد. تا وقتی آن دو طرف هماهنگ
 * نشده‌اند، شرط برداشته شده.
 *
 * وقتی هماهنگ‌سازی cTrader ↔ پنل انجام شد، این را true کنید؛ هم createOffer
 * دوباره ۴۰۹ می‌دهد و هم lookup دوباره eligible=false برمی‌گرداند. جای دیگری
 * لازم نیست عوض شود.
 *
 * نکته‌ی امنیتیِ باقی‌مانده: گیتِ واقعی «وجود داشتن حساب» است. فاکتور فقط وقتی
 * ساخته می‌شود که یک account_instance با آن لاگین پیدا شود، و چالش‌هایی که هرگز
 * پرداخت/فعال نشده‌اند حسابی ندارند — پس با برداشتن این شرط هم چالشِ
 * پرداخت‌نشده بازیابی نمی‌خورد.
 */
const REQUIRE_CLOSED_CHALLENGE = false;

// حداکثر تعداد mt_login در یک درخواست استعلام
const MAX_LOOKUP_LOGINS = 200;

// وضعیت UserChallenge بعد از احیا، بر اساس فازی که در آن رد شده
const PHASE_STATUS = {
  1: "phase1",
  2: "phase2",
  3: "real",
};

const PHASE_TITLE = {
  1: "مرحله اول",
  2: "مرحله دوم",
  3: "مرحله ریل",
};

/**
 * آیا با پرداخت قسط اول، حساب بلافاصله احیا شود؟
 *
 * true = همان رفتار خرید عادی چالش (با قسط اول حساب ساخته/فعال می‌شود).
 * اگر تصمیم کسب‌وکار عوض شد و خواستید احیا فقط بعد از تسویه‌ی کامل انجام شود،
 * این را false کنید؛ هیچ جای دیگری لازم نیست تغییر کند.
 */
const REVIVE_ON_FIRST_INSTALLMENT = true;

module.exports = {
  RECOVERY_STATUS,
  CALLBACK_STATUS,
  RECOVERY_ORDER_TYPE,
  RECOVERABLE_CHALLENGE_STATUS,
  REQUIRE_CLOSED_CHALLENGE,
  MAX_LOOKUP_LOGINS,
  PHASE_STATUS,
  PHASE_TITLE,
  REVIVE_ON_FIRST_INSTALLMENT,
};
