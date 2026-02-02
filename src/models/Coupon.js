const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");
const ChallengeType = require("./Challenge/ChallengeType");
const ChallengePlan = require("./Challenge/ChallengePlan");

const Coupon = sequelize.define("Coupon", {
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    // درصدی یا مبلغ ثابت
    type: DataTypes.ENUM("percent", "fixed"),
    allowNull: false,
  },
  value: {
    // مثلا 70 یعنی 70% یا 70 دلار
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  max_uses: {
    // حداکثر تعداد استفاده کلی
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  max_uses_per_user: {
    // حداکثر برای هر کاربر
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  used_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  valid_from: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  valid_to: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  min_order_amount_usd: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // برای محدودکردن روی یک نوع چالش یا پلن خاص
  challenge_type_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  challenge_plan_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

/* =====================
   User -> Coupon
   ===================== */
User.hasMany(Coupon, {
  foreignKey: "user_id",
  as: "coupons",
});

Coupon.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

Coupon.belongsTo(ChallengeType, {
  foreignKey: "challenge_type_id",
  as: "challengeType",
});

ChallengeType.hasMany(Coupon, {
  foreignKey: "challenge_type_id",
});

Coupon.belongsTo(ChallengePlan, {
  foreignKey: "challenge_plan_id",
  as: "challengePlan",
});

ChallengePlan.hasMany(Coupon, {
  foreignKey: "challenge_plan_id",
});

module.exports = Coupon;
