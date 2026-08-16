// درصدها رو اینجا ثابت کن تا همیشه یه منبع معتبر باشه
const INSURANCE = {
  // فاز ۱: چند درصد از مبلغ پرداختی به ولت برگرده
  PHASE1_REFUND_PERCENT: 0.3,

  // فاز ۲: چند درصد به عنوان هزینه بیمه از مبلغ قبلی کم بشه
  // مقدار جدید = مبلغ قبلی - (مبلغ قبلی * این درصد) = مبلغ قبلی * 0.7
  PHASE2_INSURANCE_FEE_PERCENT: 0.3,

  // فاز ۳: چند درصد به ولت برگرده (اگه برداشت نداشته باشه)
  PHASE3_REFUND_PERCENT: 0.5,
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
  // اگه خواستی فاز ۲ رو به صورت صریح توی انتظار پرداخت نگه داری:
  PENDING_REPURCHASE: "used",
};

module.exports = { INSURANCE, INSURANCE_PHASE, INSURANCE_STATUS };
