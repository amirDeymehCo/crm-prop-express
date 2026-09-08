const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const User = require("../User");
const Admin = require("../Admin");
const TaskDefinition = require("./TaskDefinition");

/**
 * ثبت انجام یک تسک توسط کاربر (به همراه مدرک) و نتیجه‌ی بررسی ادمین.
 * امتیاز کاربر از جمعِ همین رکوردها با وضعیت approved محاسبه می‌شود.
 */
const TaskSubmission = sequelize.define(
  "TaskSubmission",
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    task_definition_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    },

    // توضیح کاربر (مثلاً نام کاربری اینستاگرام)
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // مسیر فایل‌های مدرک
    files: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    // امتیاز در لحظه‌ی تایید قفل می‌شود تا تغییر بعدیِ تسک روی آن اثر نگذارد
    awarded_points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    admin_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "task_submissions",
    indexes: [
      { fields: ["user_id"] },
      { fields: ["task_definition_id"] },
      { fields: ["status"] },
      { fields: ["user_id", "task_definition_id"] },
    ],
  },
);

User.hasMany(TaskSubmission, { foreignKey: "user_id" });
TaskSubmission.belongsTo(User, { foreignKey: "user_id" });

Admin.hasMany(TaskSubmission, { foreignKey: "admin_id" });
TaskSubmission.belongsTo(Admin, { foreignKey: "admin_id" });

TaskDefinition.hasMany(TaskSubmission, { foreignKey: "task_definition_id" });
TaskSubmission.belongsTo(TaskDefinition, { foreignKey: "task_definition_id" });

module.exports = TaskSubmission;
