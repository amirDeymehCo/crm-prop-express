const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const User = require("../User");
const Coupon = require("../Coupon");

/**
 * دفتر مصرف امتیاز.
 *
 * هر بار که کاربر امتیازش را به کد تخفیف تبدیل می‌کند یک رکورد اینجا ثبت
 * می‌شود. موجودی امتیاز = مجموع امتیاز تاییدشده − مجموع همین جدول.
 * (مثل خودِ امتیاز، هیچ ستون موجودی‌ای ذخیره نمی‌شود.)
 */
const PointsRedemption = sequelize.define(
  "PointsRedemption",
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    coupon_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    points_spent: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    discount_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },

    // اسنپ‌شات کد، تا اگر کوپن حذف شد تاریخچه خوانا بماند
    coupon_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "task_points_redemptions",
    indexes: [{ fields: ["user_id"] }, { fields: ["coupon_id"] }],
  },
);

User.hasMany(PointsRedemption, { foreignKey: "user_id" });
PointsRedemption.belongsTo(User, { foreignKey: "user_id" });

Coupon.hasMany(PointsRedemption, { foreignKey: "coupon_id" });
PointsRedemption.belongsTo(Coupon, { foreignKey: "coupon_id" });

module.exports = PointsRedemption;
