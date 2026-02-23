const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const Call = require("./Call");
const Admin = require("../Admin");
const User = require("../User");

// models/CallReminder.js
const CallReminder = sequelize.define(
  "CallReminder",
  {
    remind_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT("medium"),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "done"),
      defaultValue: "pending",
    },
  },
  {
    tableName: "call_reminder",
    underscored: true,
  },
);

Call.hasMany(CallReminder, { foreignKey: "call_id" });
CallReminder.belongsTo(Call, { foreignKey: "call_id" });

Admin.hasMany(CallReminder, { foreignKey: "admin_id" });
CallReminder.belongsTo(Admin, { foreignKey: "admin_id" });

User.hasMany(CallReminder, { foreignKey: "user_id" });
CallReminder.belongsTo(User, { foreignKey: "user_id" });

module.exports = CallReminder;
