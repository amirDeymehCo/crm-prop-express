// models/Setting.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const Setting = sequelize.define(
  "Setting",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    dollar_price: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 0,
    },
    bonus_dollar: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 2500,
    },
    // نرخ تومانی هر دلار برای «برداشت ریالی» (نرخ فروش).
    // عمداً از dollar_price جدا است: نرخ واریز شامل bonus_dollar و حاشیه‌ی
    // امن +2500 است و اگر با همان نرخ پرداخت کنیم، روی هر دلار ضرر می‌کنیم.
    // مقدار 0 یعنی «تنظیم نشده» و در این حالت از dollar_price استفاده می‌شود.
    withdraw_dollar_price: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 0,
    },
    // حداقل مبلغ دلاری برداشت ریالی (0 = بدون محدودیت)
    min_withdraw_usd_irr: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "setting",
    // underscored: true,
    // timestamps: false,
  },
);

module.exports = Setting;
