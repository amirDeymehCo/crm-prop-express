const REJECT_REASONS = [
  { code: "RISK_PARTIAL_VIOLATION", title: "نقض ریسک شناور", category: "risk" },
  {
    code: "WEEKEND_TRADING",
    title: "معامله در روزهای شنبه و یکشنبه",
    category: "rule",
  },
  {
    code: "GROUP_HEDGING",
    title: "انجام معاملات گروهی یا کپی‌ترید بین حساب‌ها",
    category: "behavior",
  },

  {
    code: "PHASE1_20S_TRADES",
    title: "معاملات زیر 20 ثانیه در مرحله اول",
    category: "rule",
  },
  {
    code: "PHASE2_20S_TRADES",
    title: "معاملات زیر 20 ثانیه در مرحله دوم",
    category: "rule",
  },
  {
    code: "REAL_20S_TRADES",
    title: "معاملات زیر 20 ثانیه در مرحله ریل",
    category: "rule",
  },

  {
    code: "LOW_WEEKLY_TRADES",
    title: "تعداد معاملات کمتر از حداقل هفته",
    category: "rule",
  },

  {
    code: "MULTI_ACCOUNT_HEDGING",
    title: "هج کردن بین حساب‌های مختلف",
    category: "behavior",
  },
  {
    code: "NO_CONFIRM_AUTO_TRADING",
    title: "استفاده از ربات بدون تایید قبلی",
    category: "technical",
  },

  {
    code: "MULTI_DEVICE_LOGIN",
    title: "ورود به حساب از بیش از دو دستگاه",
    category: "security",
  },

  {
    code: "FREE_CHALLENGE_PAYMENT",
    title: "پرداخت هزینه چالش رایگان",
    category: "payment",
  },
  {
    code: "ARBITRAGE_USAGE",
    title: "استفاده از آربیتراژ",
    category: "behavior",
  },
  { code: "VPS_USAGE", title: "استفاده از VPS", category: "technical" },

  {
    code: "PROFIT_RULE_80",
    title: "قانون 80 درصد (مرحله تست)",
    category: "risk",
  },
  {
    code: "PROFIT_RULE_REAL_80",
    title: "قانون 80 درصد (مرحله ریل)",
    category: "risk",
  },

  {
    code: "MULTI_USER_LIMIT",
    title: "محدودیت تعداد حساب کاربری",
    category: "rule",
  },
  {
    code: "ACTIVE_CHALLENGE_LIMIT",
    title: "نقض تعداد چالش‌های فعال",
    category: "rule",
  },
  { code: "NEWS_TRADING", title: "ریسک شناور هنگام خبر", category: "risk" },

  { code: "TIME_LIMIT_60_DAYS", title: "نقض محدودیت 60 روز", category: "rule" },
];

module.exports = { REJECT_REASONS };
