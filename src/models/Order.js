// models/Order.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const User = require("./User");
const UserChallenge = require("./Challenge/UserChallenge");
const Admin = require("./Admin");

const Order = sequelize.define(
  "Order",
  {
    // نوع سفارش: الان فقط چالش، ولی بعداً اگر خواستی چیزای دیگه اضافه می‌کنی
    type: {
      type: DataTypes.ENUM(
        "challenge_purchase",
        "challenge_purchase_wallet",
        "wallet_deposit",
        "wallet_withdraw",
      ),
      allowNull: false,
    },
    // مبلغ‌ها
    amount_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    amount_irr: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    currency: {
      type: DataTypes.ENUM("USD", "IRR"),
      allowNull: false,
      defaultValue: "USD",
    },

    // درگاه
    gateway: {
      type: DataTypes.ENUM(
        "peykan",
        "nowpayments",
        "wallet",
        "coupon_free",
        "admin",
      ), // مثلا "peykan", "idpay", ...
      allowNull: false,
    },

    // وضعیت سفارش
    status: {
      type: DataTypes.ENUM("pending", "paid", "failed", "cancelled", "expired"),
      allowNull: false,
      defaultValue: "pending",
    },

    // شناسه‌هایی برای درگاه
    gateway_order_id: {
      // id‌ای که خودت برای درگاه می‌فرستی (مثلا شناسه سفارش داخلی)
      type: DataTypes.STRING,
      allowNull: true,
    },
    gateway_payment_id: {
      // مثلا authority، ref_id یا هرچیزی که درگاه برمی‌گردونه
      type: DataTypes.STRING,
      allowNull: true,
    },

    // زمان پرداخت موفق
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // برای ذخیره درخواست/پاسخ خام درگاه (برای دیباگ و لاگ)
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "orders",
    // underscored: true,
    // timestamps: false,
  },
);

// ریلیشن‌ها
User.hasMany(Order, { foreignKey: "user_id" });
Order.belongsTo(User, { foreignKey: "user_id" });

// ریلیشن‌ها
Admin.hasMany(Order, { foreignKey: "admin_id" });
Order.belongsTo(Admin, { foreignKey: "admin_id" });

// یک چالش می‌تونه چند Order داشته باشد (کاربر چند بار تلاش برای پرداخت کند)
UserChallenge.hasMany(Order, { foreignKey: "user_challenge_id" });
Order.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });

module.exports = Order;
