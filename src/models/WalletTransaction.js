// models/WalletTransaction.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Wallet = require("./Wallet");
const Admin = require("./Admin");

const WalletTransaction = sequelize.define(
  "WalletTransaction",
  {
    type: {
      type: DataTypes.ENUM(
        "deposit",
        "withdraw",
        "refral_deposit",
        "buy_ch",
        "transfer_in",
        "transfer_out",
        "adjustment",
      ),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    balance_before: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    balance_after: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    ref_id: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    reference_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("pending", "completed", "failed", "harvested"),
      allowNull: false,
      defaultValue: "completed",
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
    },
    actor_type: {
      type: DataTypes.ENUM("user", "admin", "system"),
      allowNull: false,
      defaultValue: "system",
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    wallet_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "wallet_transactions",
    underscored: true,
  },
);

WalletTransaction.belongsTo(Wallet, { foreignKey: "wallet_id" });
Wallet.hasMany(WalletTransaction, { foreignKey: "wallet_id" });

WalletTransaction.belongsTo(Admin, { foreignKey: "admin_id" });
Admin.hasMany(WalletTransaction, { foreignKey: "admin_id" });

module.exports = WalletTransaction;
