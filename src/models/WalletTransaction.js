// models/WalletTransaction.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Wallet = require("./Wallet");

const WalletTransaction = sequelize.define("WalletTransaction", {
    type: {
        type: DataTypes.ENUM("deposit", "withdraw", "transfer_in", "transfer_out", "adjustment"),
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
        unique: true,
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
}, {
    tableName: "wallet_transactions",
    underscored: true,
});

WalletTransaction.belongsTo(Wallet, { foreignKey: "wallet_id" });
Wallet.hasMany(WalletTransaction, { foreignKey: "wallet_id" });

module.exports = WalletTransaction;
