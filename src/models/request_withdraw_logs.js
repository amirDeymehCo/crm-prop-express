// models/Setting.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Admin = require("./Admin");
const WidthdrawRequest = require("./WidthdrawRequest");

const RequestWithdrawLogs = sequelize.define(
  "RequestWithdrawLogs",
  {
    old_status: {
      type: DataTypes.ENUM("waiting", "verify", "canceled"),
      allowNull: false,
    },
    new_status: {
      type: DataTypes.ENUM("waiting", "verify", "canceled"),
      allowNull: false,
    },
  },
  {
    tableName: "request_withdraw_logs",
  },
);

Admin.hasMany(RequestWithdrawLogs, { foreignKey: "admin_id" });
RequestWithdrawLogs.belongsTo(Admin, { foreignKey: "admin_id" });

WidthdrawRequest.hasMany(RequestWithdrawLogs, { foreignKey: "log_id" });
RequestWithdrawLogs.belongsTo(WidthdrawRequest, { foreignKey: "log_id" });

module.exports = RequestWithdrawLogs;
