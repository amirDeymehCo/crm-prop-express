const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

/**
 * پله‌های تخفیف بر اساس امتیاز.
 * مثال صفحه: ۱۰ امتیاز → ۵٪ ، ۲۰ → ۱۰٪ ، ۳۵ → ۱۵٪ ، ۵۰ → ۲۰٪
 */
const DiscountTier = sequelize.define(
  "DiscountTier",
  {
    min_points: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    discount_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "task_discount_tiers",
    indexes: [{ fields: ["min_points"] }, { fields: ["is_active"] }],
  },
);

module.exports = DiscountTier;
