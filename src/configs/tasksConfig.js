/**
 * تسک‌های پیش‌فرض صفحه‌ی «تسک‌ها و امتیازها» و پله‌های تخفیف.
 *
 * `code` شناسه‌ی ثابت هر تسک است؛ seed بر اساس همین کار می‌کند،
 * پس عنوان و امتیاز را می‌شود عوض کرد ولی code نباید تغییر کند.
 *
 * لینک‌ها از متغیرهای محیطی خوانده می‌شوند تا بدون تغییر کد قابل تنظیم باشند.
 */

const TASKS = [
  // ==================== شبکه‌های اجتماعی ====================
  {
    code: "social_instagram_follow",
    title: "دنبال کردن اینستاگرام مای‌پراپ",
    description:
      "پیج اینستاگرام مای‌پراپ را دنبال کنید و نام کاربری خود را برای بررسی ثبت کنید.",
    category: "social",
    points: 3,
    action_url: process.env.SOCIAL_INSTAGRAM_URL || "https://instagram.com/",
    action_label: "رفتن به اینستاگرام",
    verify_type: "manual",
    is_repeatable: false,
    requires_proof: true,
    sort_order: 1,
  },
  {
    code: "social_telegram_channel",
    title: "عضویت در کانال تلگرام",
    description:
      "در کانال تلگرام مای‌پراپ عضو شوید. عضویت شما به‌صورت خودکار بررسی می‌شود.",
    category: "social",
    points: 3,
    action_url: process.env.SOCIAL_TELEGRAM_CHANNEL_URL || "https://t.me/",
    action_label: "عضویت در کانال",
    verify_type: "auto",
    is_repeatable: false,
    requires_proof: false,
    sort_order: 2,
  },
  {
    code: "social_telegram_group",
    title: "عضویت در گروه تلگرام",
    description:
      "در گروه گفتگوی مای‌پراپ عضو شوید. عضویت شما به‌صورت خودکار بررسی می‌شود.",
    category: "social",
    points: 3,
    action_url: process.env.SOCIAL_TELEGRAM_GROUP_URL || "https://t.me/",
    action_label: "عضویت در گروه",
    verify_type: "auto",
    is_repeatable: false,
    requires_proof: false,
    sort_order: 3,
  },
  {
    code: "social_youtube_subscribe",
    title: "سابسکرایب کانال یوتیوب",
    description: "کانال یوتیوب مای‌پراپ را سابسکرایب کنید و تصویر آن را ارسال کنید.",
    category: "social",
    points: 3,
    action_url: process.env.SOCIAL_YOUTUBE_URL || "https://youtube.com/",
    action_label: "رفتن به یوتیوب",
    verify_type: "manual",
    is_repeatable: false,
    requires_proof: true,
    sort_order: 4,
  },

  // ==================== مشارکت در محتوا ====================
  {
    code: "content_article_comment",
    title: "ثبت نظر برای مقالات",
    description:
      "برای هر مقاله‌ای که نظر ثبت کنید ۱ امتیاز می‌گیرید. هرچه بیشتر، امتیاز بیشتر (نکته: ثبت نظر باید با ایمیل کاربری شما ثبت شود).",
    category: "content",
    points: 1,
    action_url: process.env.SITE_ARTICLES_URL || null,
    action_label: "مشاهده مقالات",
    verify_type: "manual",
    is_repeatable: true,
    // سقف ندارد؛ هر مقاله یک ثبت جداگانه
    max_submissions: null,
    requires_proof: true,
    sort_order: 5,
  },

  // ==================== اشتراک‌گذاری سرتیفیکیت ====================
  {
    code: "certificate_share_myprop_group",
    title: "انتشار سرتیفیکیت در گروه مای‌پراپ",
    description:
      "سرتیفیکیت خود را در گروه مای‌پراپ منتشر کنید و دریافت سود را اعلام کنید.",
    category: "certificate",
    points: 10,
    action_url: process.env.SOCIAL_TELEGRAM_GROUP_URL || "https://t.me/",
    action_label: "رفتن به گروه",
    verify_type: "manual",
    is_repeatable: false,
    requires_proof: true,
    sort_order: 6,
    // فقط برای کاربری که برداشت سود داشته
    requires_payout: true,
  },
  {
    code: "certificate_share_review_groups",
    title: "انتشار سرتیفیکیت در گروه‌های بررسی پراپ",
    description:
      "سرتیفیکیت خود را در گروه‌های بررسی پراپ منتشر کنید. برای هر گروه ۱ امتیاز در نظر گرفته می‌شود.",
    category: "certificate",
    points: 1,
    action_url: null,
    action_label: null,
    verify_type: "manual",
    is_repeatable: true,
    max_submissions: null,
    requires_proof: true,
    sort_order: 7,
    requires_payout: true,
  },
];

/** پله‌های تخفیف بر اساس امتیاز */
const DISCOUNT_TIERS = [
  { min_points: 10, discount_percent: 5 },
  { min_points: 20, discount_percent: 10 },
  { min_points: 35, discount_percent: 15 },
  { min_points: 50, discount_percent: 20 },
];

module.exports = { TASKS, DISCOUNT_TIERS };
