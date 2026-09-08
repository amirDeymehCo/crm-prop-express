const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

/**
 * تعریف یک تسک امتیازی که ادمین می‌سازد.
 * (دنبال کردن اینستاگرام، عضویت در کانال، ثبت نظر برای مقالات و ...)
 */
const TaskDefinition = sequelize.define(
  "TaskDefinition",
  {
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // گروه‌بندی کارت‌ها در صفحه
    category: {
      type: DataTypes.ENUM("social", "content", "certificate", "other"),
      allowNull: false,
      defaultValue: "social",
    },

    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    // دکمه‌ی «رفتن به اینستاگرام / کانال / مقالات»
    action_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    action_label: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // manual = کاربر مدرک می‌فرستد و ادمین تایید می‌کند
    // auto   = بررسی خودکار (فعلاً مثل manual رفتار می‌کند تا اتصالش آماده شود)
    verify_type: {
      type: DataTypes.ENUM("manual", "auto"),
      allowNull: false,
      defaultValue: "manual",
    },

    // آیا کاربر می‌تواند چند بار انجامش دهد (مثل «۱ امتیاز برای هر مورد»)
    is_repeatable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // سقف دفعات برای تسک تکرارشونده (null = بی‌نهایت)
    max_submissions: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // آیا فرستادن مدرک الزامی است
    requires_proof: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "task_definitions",
    indexes: [{ fields: ["category"] }, { fields: ["is_active"] }],
  },
);

module.exports = TaskDefinition;
