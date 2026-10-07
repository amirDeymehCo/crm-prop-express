// models/WalletHold.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Wallet = require("./Wallet");
const User = require("./User");

/**
 * رزرو موقت موجودی ولت.
 *
 * وقتی سرویس پارتنر (پنل PHP) با `hold_minutes` پول کم می‌کند، مبلغ همان لحظه
 * از ولت کسر می‌شود ولی یک ردیف «رزرو» با `expires_at` ساخته می‌شود. اگر تا آن
 * زمان رزرو `settle` نشود، کرون پول را به ولت کاربر برمی‌گرداند.
 *
 * وضعیت‌ها:
 *   held     → پول کسر شده، منتظر تایید یا انقضا
 *   settled  → پارتنر تایید کرده؛ پول نهایی شد و برنمی‌گردد
 *   refunded → پارتنر قبل از انقضا لغو کرد؛ پول برگشت
 *   expired  → مهلت گذشت و کرون پول را برگرداند
 */
const WalletHold = sequelize.define(
  "WalletHold",
  {
    amount: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("held", "settled", "refunded", "expired"),
      allowNull: false,
      defaultValue: "held",
    },
    reason: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "competition",
    },
    description: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
    },
    // شناسه‌ی سمت پارتنر؛ unique است تا retry دوباره پول کم نکند
    reference_id: {
      type: DataTypes.STRING(191),
      allowNull: true,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    settled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    released_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // تراکنش کسر اولیه و تراکنش برگشت
    debit_transaction_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    refund_transaction_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    partner: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    wallet_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "wallet_holds",
    indexes: [
      // کرون انقضا فقط همین دو ستون را فیلتر می‌کند
      { fields: ["status", "expires_at"] },
      { fields: ["user_id"] },
    ],
  },
);

WalletHold.belongsTo(Wallet, { foreignKey: "wallet_id" });
Wallet.hasMany(WalletHold, { foreignKey: "wallet_id" });

WalletHold.belongsTo(User, { foreignKey: "user_id" });
User.hasMany(WalletHold, { foreignKey: "user_id" });

module.exports = WalletHold;
