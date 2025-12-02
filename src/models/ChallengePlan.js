// models/ChallengePlan.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const ChallengeType = require("./ChallengeType");

const ChallengePlan = sequelize.define("ChallengePlan", {
    logo: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    title: {                       // عنوان روی کارت، مثلا "چالش پیشرفته"
        type: DataTypes.STRING,
        allowNull: false,
    },
    account_size_usd: {            // سایز حساب: 10000
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
    },
    currency: {                    // مثلا "USD"
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "USD",
    },
    leverage: {                    // لوریج: مثلا 1:100 => می‌تونی فقط 100 ذخیره کنی
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    price_usd: {                   // قیمت چالش برای پرداخت دلاری
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
    },
    price_irr: {                   // قیمت ریالی (اگر داری)
        type: DataTypes.BIGINT,
        allowNull: true,
    },
    profit_share_percent: {        // درصد سود در حساب اصلی، مثلا 80
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 80,
    },
    max_daily_drawdown_percent: {  // ریسک روزانه
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
    },
    max_overall_drawdown_percent: { // ریسک کلی
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    /// insurance
    allow_insurance: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    insurance_fee_type: {
        type: DataTypes.ENUM("percent_of_price", "percent_of_balance", "fixed"),
        allowNull: true,
    },
    insurance_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
    },
    // floating_risk (ریسک شناور )
    has_floating_risk: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    floating_risk_type: {
        type: DataTypes.ENUM("percent", "fixed"),
        allowNull: true, // وقتی has_floating_risk = false باشه، خالی می‌مونه
    },
    floating_risk_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
    },
    floating_risk_base_on: {
        type: DataTypes.ENUM("starting_balance", "current_balance"),
        allowNull: true,
    },
});

// ریلیشن
ChallengeType.hasMany(ChallengePlan, { foreignKey: "challenge_type_id" });
ChallengePlan.belongsTo(ChallengeType, { foreignKey: "challenge_type_id" });

module.exports = ChallengePlan;
