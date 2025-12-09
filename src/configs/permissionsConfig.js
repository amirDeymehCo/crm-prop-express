// rbacConfig.js

// ۱) پرمیشن‌های ریز
const PERMISSIONS = [
    // Ticket
    { code: "ticket.read", description: "مشاهده تیکت‌ها" },
    { code: "ticket.reply", description: "پاسخ به تیکت‌ها" },
    { code: "ticket.delete", description: "حذف تیکت‌ها" },

    // User
    { code: "user.read", description: "مشاهده کاربران" },
    { code: "user.edit", description: "ویرایش کاربران" },

    // Finance
    { code: "payment.read", description: "مشاهده پرداخت‌ها" },
    { code: "payment.verify", description: "تایید پرداخت‌ها" },

    //Customer
    { code: "customer.read", description: "مشاهده اطلاعات" },
    { code: "customer.calls", description: "تماس ها" },
    { code: "customer.sms", description: "پیام ها" },
];


// ۲) گروه‌ها + این‌که چه permissionهایی داشته باشن
const GROUPS = [
    {
        code: "support.view_only",
        name: "پشتیبان - فقط مشاهده",
        description: "دسترسی فقط برای دیدن تیکت‌ها",
        permissions: ["ticket.read"],
    },
    {
        code: "support.basic",
        name: "پشتیبان - عادی",
        description: "دیدن و پاسخ دادن به تیکت‌ها",
        permissions: ["ticket.read", "ticket.reply"],
    },
    {
        code: "finance.standard",
        name: "مالی - استاندارد",
        description: "مشاهده و تایید پرداخت‌ها",
        permissions: ["payment.read", "payment.verify"],
    },
    {
        code: "customer.standard",
        name: "ارتباط با مشتری - فول",
        description: "مشاهده و تایید پرداخت‌ها",
        permissions: ["payment.read", "payment.verify"],
    },
];

module.exports = { PERMISSIONS, GROUPS };
