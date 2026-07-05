// rbacConfig.js

const PERMISSIONS = [
  // Orders - سفارشات
  { code: "order.list", description: "لیست سفارشات" },
  { code: "order.read", description: "مشاهده اطلاعات سفارش" },
  { code: "order.create", description: "ایجاد سفارش جدید" },

  // Users - کاربران
  { code: "user.list", description: "لیست کاربران" },
  { code: "user.create", description: "ایجاد کاربر جدید" },
  { code: "user.read", description: "مشاهده اطلاعات یک کاربر" },

  // Sales Team - تیم فروش
  { code: "sales.calls.list", description: "لیست تماس‌ها" },
  { code: "sales.calls.read", description: "مشاهده تماس" },
  { code: "sales.calls.create", description: "ثبت تماس جدید" },
  { code: "sales.sms.list", description: "لیست پیامک‌ها" },
  { code: "sales.sms.send", description: "ارسال پیامک جدید" },
  { code: "sales.report.read", description: "مشاهده گزارش تیم فروش" },

  // Support Team - تیم پشتیبانی
  { code: "support.ticket.list", description: "لیست تیکت‌ها" },
  { code: "support.ticket.create", description: "ثبت تیکت جدید" },
  { code: "support.ticket.reply", description: "مشاهده و پاسخ به تیکت" },
  { code: "support.report.read", description: "مشاهده گزارش تیم پشتیبانی" },

  // Profit Withdrawals - برداشت سود
  { code: "profit.list", description: "لیست برداشت سودها" },
  { code: "profit.chat.read", description: "مشاهده اطلاعات چت برداشت سود" },
  { code: "profit.chat.edit", description: "ویرایش اطلاعات" },

  // Discounts - تخفیفات
  { code: "discount.list", description: "لیست تخفیف‌ها" },
  { code: "discount.manage", description: "ایجاد و ویرایش تخفیف" },
  { code: "discount.delete", description: "حذف کد تخفیف" },

  // Certificates - گواهینامه‌ها
  { code: "certificate.list", description: "لیست گواهینامه‌ها" },
  { code: "certificate.create", description: "ساخت گواهینامه‌ها" },

  // Referral - رفرال
  { code: "referral.list", description: "لیست رفرال‌ها" },

  // KYC - احراز هویت
  { code: "kyc.list", description: "لیست احراز هویت‌ها" },
  {
    code: "kyc.manage",
    description: "مشاهده اطلاعات و تغییر وضعیت احراز هویت",
  },
];

const GROUPS = [
  {
    code: "order",
    name: "سفارشات",
    description: "دسترسی کامل به بخش سفارشات",
    permissions: ["order.list", "order.read", "order.create"],
  },
  {
    code: "user",
    name: "کاربران",
    description: "دسترسی کامل به بخش کاربران",
    permissions: ["user.list", "user.read", "user.create"],
  },
  {
    code: "sales",
    name: "تیم فروش",
    description: "دسترسی کامل به تیم فروش",
    permissions: [
      "sales.calls.list",
      "sales.calls.read",
      "sales.calls.create",
      "sales.sms.list",
      "sales.sms.send",
      "sales.report.read",
    ],
  },
  {
    code: "support",
    name: "تیم پشتیبانی",
    description: "دسترسی کامل به تیم پشتیبانی",
    permissions: [
      "support.ticket.list",
      "support.ticket.create",
      "support.ticket.reply",
      "support.report.read",
    ],
  },
  {
    code: "profit",
    name: "برداشت سود",
    description: "دسترسی کامل به برداشت سودها",
    permissions: ["profit.list", "profit.chat.read", "profit.chat.edit"],
  },
  {
    code: "discount",
    name: "تخفیفات",
    description: "دسترسی کامل به تخفیفات",
    permissions: ["discount.list", "discount.manage"],
  },
  {
    code: "certificate",
    name: "گواهینامه‌ها",
    description: "دسترسی به گواهینامه‌ها",
    permissions: ["certificate.list", "certificate.create"],
  },
  {
    code: "referral",
    name: "رفرال",
    description: "دسترسی به رفرال‌ها",
    permissions: ["referral.list"],
  },
  {
    code: "kyc",
    name: "احراز هویت",
    description: "مدیریت احراز هویت کاربران",
    permissions: ["kyc.list", "kyc.manage"],
  },
];

module.exports = { PERMISSIONS, GROUPS };
