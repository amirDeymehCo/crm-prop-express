// درصد تخفیفِ چالشِ جایگزین، بر اساس فازی که کاربر توش رد شده
const INSURANCE_DISCOUNT_PERCENT = {
  1: 40, // مرحله اول
  2: 30, // مرحله دوم
  3: 20, // مرحله ریل
};

const INSURANCE_PHASE = {
  PHASE_1: 1,
  PHASE_2: 2,
  REAL: 3,
};

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
  INSURANCE_STATUS,
  INSURANCE_EVENT_TYPE,
  PHASE_TITLE,
};
