// models/Payment.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");
const ChallengePlan = require("./Challenge/ChallengePlan");
const UserChallenge = require("./Challenge/UserChallenge");

const Payment = sequelize.define(
  "Payment",
  {
    provider: {
      type: DataTypes.ENUM("paykan", "nowpayments", "wallet", "coupon_free"),
      allowNull: false,
    },
    order_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // مبلغ دلاری که می‌خوای به ولت داخلی بزنی
    amount_usd: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    amount_irr: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: true,
    },
    // NOWPayments side
    provider_payment_id: {
      // payment_id یا invoice_id
      type: DataTypes.STRING,
    },
    pay_currency: {
      type: DataTypes.STRING, // مثلاً 'btc', 'usdttrc20'
    },
    pay_amount: {
      type: DataTypes.DECIMAL(36, 18),
    },
    status: {
      type: DataTypes.ENUM(
        "pending", // ما تعریف کردیم
        "waiting",
        "confirming",
        "confirmed",
        "sending",
        "partially_paid",
        "finished",
        "failed",
        "refunded",
        "expired",
        "confirmed_free",
      ),
      allowNull: false,
      defaultValue: "pending",
    },
    raw_callback: {
      type: DataTypes.JSON,
    },
    UserChallenge: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: UserChallenge },
    },
  },
  {
    tableName: "payments_set",
    underscored: true,
  },
);

Payment.belongsTo(User, { foreignKey: "user_id" });

module.exports = Payment;
