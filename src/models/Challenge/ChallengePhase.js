// models/ChallengePhase.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const ChallengeType = require("./ChallengeType");
const ChallengePlan = require("./ChallengePlan");

const ChallengePhase = sequelize.define("ChallengePhase", {
    phase_index: {                 // 1 = مرحله اول، 2 = دوم، 3 = حساب اصلی
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    group: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    name: {                        // "مرحله اول" / "مرحله دوم" / "حساب اصلی"
        type: DataTypes.STRING,
        allowNull: false,

    },

    // قوانین اصلی فاز
    duration_days: {               // مدت زمان فاز
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    min_trading_days: {            // حداقل روز معاملاتی
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    max_daily_drawdown_percent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
    },
    max_overall_drawdown_percent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
    },
    profit_target_percent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
    },
    notes: {
        type: DataTypes.TEXT,
    },
    // فیلد اختیاری
    account_size_usd_override: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true, // اگر null بود یعنی همان account_size_usd پلن
    },

    // اگر فاز۲ هزینه جدا دارد
    phase_fee_usd: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
    },
    phase_fee_irr: {
        type: DataTypes.BIGINT,
        allowNull: true,
    },
});

ChallengePlan.hasMany(ChallengePhase, { foreignKey: "challenge_plan_id" });
ChallengePhase.belongsTo(ChallengePlan, { foreignKey: "challenge_plan_id" });

ChallengeType.hasMany(ChallengePhase, { foreignKey: "challenge_type_id" });
ChallengePhase.belongsTo(ChallengeType, { foreignKey: "challenge_type_id" });


module.exports = ChallengePhase;
