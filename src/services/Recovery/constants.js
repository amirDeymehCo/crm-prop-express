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

// فقط چالشی که در این وضعیت باشد قابل بازیابی است
const RECOVERABLE_CHALLENGE_STATUS = "closed";

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
  MAX_LOOKUP_LOGINS,
  PHASE_STATUS,
  PHASE_TITLE,
  REVIVE_ON_FIRST_INSTALLMENT,
};
