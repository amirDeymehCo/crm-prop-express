// models/ChallengeRecovery.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

/**
 * «بازیابی حساب»
 *
 * وقتی حساب کاربر fail می‌شود، تیم فروش (از پنل PHP) با او تماس می‌گیرد و یک
 * مبلغ تخفیف‌خورده پیشنهاد می‌دهد. هر پیشنهاد یک رکورد از این جدول است.
 *
 * نکته‌ی مهم: این رکورد «وضعیت پرداخت بازیابی» را مستقل از
 * UserChallenge.payment_status نگه می‌دارد. اگر وضعیت اقساط بازیابی را روی خود
 * چالش می‌نوشتیم، کال‌بک خرید چالش (callbackBuyCh) آن را قسط دوم خرید حساب
 * می‌دید و کاربر را به فاز ریل می‌برد.
 */
const ChallengeRecovery = sequelize.define(
  "ChallengeRecovery",
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    user_challenge_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // حسابی که fail شده و قرار است احیا شود
    account_instance_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // اسنپ‌شات لاگین؛ کلیدی که سمت PHP با آن کار می‌کنند
    mt_login: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // فازی که کاربر در آن رد شده و بعد از پرداخت به همان برمی‌گردد
    phase_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },

    status: {
      type: DataTypes.ENUM(
        "pending_payment",
        "partially_paid",
        "paid",
        "cancelled",
        "expired",
      ),
      allowNull: false,
      defaultValue: "pending_payment",
    },

    payment_plan: {
      type: DataTypes.ENUM("full", "installment"),
      allowNull: false,
      defaultValue: "full",
    },

    // قیمتی که کاربر دفعه‌ی قبل بابت همین چالش پرداخت کرده بود (فقط برای نمایش و لاگ)
    previous_price_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },

    // مبلغی که ادمینِ سمت PHP تعیین کرده — کل مبلغ قابل پرداخت
    offer_price_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },

    offer_price_irr: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
    },

    first_amount_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
    },
    first_amount_irr: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
    },

    // در پرداخت یکجا null است
    second_amount_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },
    second_amount_irr: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },

    paid_amount_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
    },

    // همه‌ی سفارش‌های این بازیابی (قسط اول و دوم) با همین کلید به هم وصل‌اند
    order_group_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    // شناسه‌ی همین پیشنهاد در سیستم PHP
    external_ref: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // کارشناس فروشی که قیمت را ثبت کرده (رشته‌ی آزاد از سمت PHP)
    agent_label: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    first_paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    second_paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // لحظه‌ای که چالش/حساب واقعاً احیا شد (قسط اول کافی است)
    revived_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // ── یادآورهای پیامکی نزدیک به پایان مهلت ──
    // هر کدام یک بار پر می‌شوند و همین جلوی ارسال تکراری را می‌گیرد.
    reminder_5h_sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    reminder_30m_sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // وضعیت اطلاع‌رسانی به سرویس PHP بعد از پرداخت
    callback_status: {
      type: DataTypes.ENUM("pending", "sent", "failed", "skipped"),
      allowNull: false,
      defaultValue: "pending",
    },

    callback_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    callback_last_error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    callback_sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "challenge_recoveries",
    indexes: [
      { fields: ["user_id"] },
      { fields: ["user_challenge_id"] },
      { fields: ["account_instance_id"] },
      { fields: ["mt_login"] },
      { fields: ["status"] },
      { fields: ["callback_status"] },
      // کرونِ یادآور روی همین دو ستون فیلتر می‌کند
      { fields: ["status", "expires_at"] },
      { fields: ["user_challenge_id", "status"] },
    ],
  },
);

module.exports = ChallengeRecovery;
