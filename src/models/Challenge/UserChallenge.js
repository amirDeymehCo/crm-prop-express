// models/UserChallenge.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const User = require("../User");
const ChallengePlan = require("./ChallengePlan");
const { STATUS_USER_CHALLENGE } = require("../../utils/statusList");
const ChallengePhase = require("./ChallengePhase");
const ChallengeType = require("./ChallengeType");
const Admin = require("../Admin");

const UserChallenge = sequelize.define("UserChallenge", {
  status: {
    type: DataTypes.ENUM(...STATUS_USER_CHALLENGE),
    allowNull: false,
    defaultValue: "pending_payment",
  },
  current_phase_index: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  // چرخه funded (بعد از هر payout اگر حساب جدید می‌سازی)
  funded_cycle_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  started_at: {
    type: DataTypes.DATE,
  },
  ended_at: {
    type: DataTypes.DATE,
  },
  /// insurance
  has_insurance: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  insurance_fee_usd: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: true,
  },
  insurance_status: {
    type: DataTypes.ENUM("none", "active", "used", "cancelled"),
    allowNull: false,
    defaultValue: "none",
  },
  // coupon
  price_usd: {
    // قیمت پایه بدون تخفیف
    type: DataTypes.DECIMAL(18, 2),
    allowNull: false,
  },
  discount_usd: {
    // مجموع تخفیف‌ها
    type: DataTypes.DECIMAL(18, 2),
    allowNull: false,
    defaultValue: 0,
  },
  final_price_usd: {
    // مبلغ نهایی قابل پرداخت
    type: DataTypes.DECIMAL(18, 2),
    allowNull: false,
  },
  coupon_code_snapshot: {
    // برای این‌که اگر بعدا کوپن حذف شد، همچنان بدونیم چی بوده
    type: DataTypes.STRING,
    allowNull: true,
  },
  // ریسک شناور اسنپ‌شات شده از پلن
  floating_risk_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  floating_risk_type: {
    type: DataTypes.ENUM("percent", "fixed"),
    allowNull: true,
  },
  floating_risk_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  floating_risk_base_on: {
    type: DataTypes.ENUM("starting_balance", "current_balance"),
    allowNull: true,
  },
  floating_risk_max_risk_usd: {
    // دلاری نهایی بر اساس بالانس اولیه
    type: DataTypes.DECIMAL(18, 2),
    allowNull: true,
  },
  rules_snapshot: {
    type: DataTypes.JSON,
    allowNull: true,
  },
});

User.hasMany(UserChallenge, { foreignKey: "user_id" });
UserChallenge.belongsTo(User, { foreignKey: "user_id" });

Admin.hasMany(UserChallenge, { foreignKey: "admin_id" });
UserChallenge.belongsTo(Admin, { foreignKey: "admin_id" });

UserChallenge.belongsTo(ChallengeType, { foreignKey: "challenge_type_id" });
ChallengeType.hasMany(UserChallenge, { foreignKey: "challenge_type_id" });

ChallengeType.hasMany(ChallengePlan, {
  foreignKey: "challenge_type_id",
  as: "plans",
});
ChallengePlan.belongsTo(ChallengeType, {
  foreignKey: "challenge_type_id",
  as: "type",
});

ChallengePlan.hasMany(UserChallenge, { foreignKey: "challenge_plan_id" });
UserChallenge.belongsTo(ChallengePlan, { foreignKey: "challenge_plan_id" });

UserChallenge.belongsTo(ChallengePhase, { foreignKey: "challenge_phase" });

module.exports = UserChallenge;
