// models/Wallet.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");

const Wallet = sequelize.define("Wallet", {
    balance: {
        type: DataTypes.DECIMAL(18, 4),
        allowNull: false,
        defaultValue: 0,
    },
    currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "USD",
    },
}, {
    tableName: "wallets",
    underscored: true,
});

Wallet.belongsTo(User, { foreignKey: "user_id" });
User.hasOne(Wallet, { foreignKey: "user_id" });

module.exports = Wallet;
