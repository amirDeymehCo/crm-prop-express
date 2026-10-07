// درصد تخفیفِ چالشِ جایگزین، بر اساس فازی که کاربر توش رد شده
const INSURANCE_DISCOUNT_PERCENT = {
  1: 50, // مرحله اول
  2: 40, // مرحله دوم
  3: 30, // مرحله ریل
};

const INSURANCE_PHASE = {
  PHASE_1: 1,
  PHASE_2: 2,
  REAL: 3,
};

/**
 * نوع چالش‌هایی که از همان ابتدا «ریل» هستند (الیت).
 *
 * این چالش‌ها مرحله اول و دوم ندارند، پس current_phase_index شان تا آخر
 * عمر ۱ می‌ماند. بدون این لیست، بیمه آن‌ها را «رد شده در مرحله اول» حساب
 * می‌کرد و ۵۰٪ تخفیف می‌داد، در حالی که باید ۳۰٪ مرحله ریل باشد.
 *
 * ⚠️ id هاردکد است. اگر نوع چالش ریل‌از‌ابتدای دیگری اضافه شد،
 * فقط همین آرایه را به‌روز کنید.
 */
const INSTANT_REAL_CHALLENGE_TYPE_IDS = [4];

const INSURANCE_STATUS = {
  NONE: "none",
  ACTIVE: "active",
  USED: "used",
  CANCELLED: "cancelled",
};

// enum مجاز history_challenge.type به ازای هر فاز
const INSURANCE_EVENT_TYPE = {
  1: "insurance_paid",
  2: "insurance_paid_phase2",
  3: "insurance_paid_phase3",
};

const PHASE_TITLE = {
  1: "مرحله اول",
  2: "مرحله دوم",
  3: "مرحله ریل",
};

module.exports = {
  INSURANCE_DISCOUNT_PERCENT,
  INSURANCE_PHASE,
  INSTANT_REAL_CHALLENGE_TYPE_IDS,
  INSURANCE_STATUS,
  INSURANCE_EVENT_TYPE,
  PHASE_TITLE,
};
