const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");

// ReferralCommissionRule.js
const ReferralCommissionRule = sequelize.define("ReferralCommissionRule", {
    referrer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    referred_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // اگه null باشه یعنی برای همه زیرمجموعه‌ها
    },
    percent: {
        type: DataTypes.DECIMAL(5, 2), // مثلا 10.50 درصد
        allowNull: false,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
});

ReferralCommissionRule.belongsTo(User, {
    foreignKey: "referrer_id",
    as: "referrer",
});
ReferralCommissionRule.belongsTo(User, {
    foreignKey: "referred_user_id",
    as: "referredUser",
});
