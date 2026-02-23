// src/models/Call.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const User = require("../User");
const Admin = require("../Admin");
const CallRejectReason = require("./CallRejectReason");
const CallResultOption = require("./CallResultOption");
const CallResult = require("./CallResult");

const Call = sequelize.define(
  "Call",
  {
    description: {
      type: DataTypes.TEXT("medium"),
      allowNull: false,
    },
    is_answer: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    how_find: {
      type: DataTypes.ENUM(
        "EMAIL",
        "SMS",
        "TELEGRAM",
        "INSTAGRAM",
        "WHATSAPP",
        "FREANDS",
        "GOOGLE",
      ),
      allowNull: true,
    },
    category: {
      type: DataTypes.ENUM(
        "NEW_USER",
        "CANCELED",
        "FREE_CHALLENGE",
        "NOT_PASSED",
        "WAIT_PAYEMNT_FREE_CAHLLENGE",
        "WAIT_PEYAMNT",
        "BIME_CHALLENGE",
        "PHONES_BUY",
        "PHONES_NOT_BUY",
        "CAMPAIGN",
      ),
      allowNull: true,
    },
    time: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    direction: {
      // نوع تماس (تماس ورودی | تماس خروجی)
      type: DataTypes.ENUM("outbound", "inbound"),
      defaultValue: "outbound",
    },
    date_create_call: {
      type: DataTypes.DATE,
      defaultValue: new Date(),
      allowNull: true,
    },
    reject_reason_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "call_history",
    timestamps: true,
  },
);

Call.belongsTo(User, {
  as: "user",
  foreignKey: "user_id",
});
User.hasMany(Call, {
  as: "calls",
  foreignKey: "user_id",
});

Call.belongsTo(Admin, {
  as: "admin",
  foreignKey: "admin_id",
});

Call.belongsTo(CallRejectReason, {
  as: "reject_reason",
  foreignKey: "reject_reason_id",
});

Call.belongsToMany(CallResultOption, {
  through: CallResult,
  as: "results",
  foreignKey: "call_id",
  otherKey: "result_option_id",
});

CallResultOption.belongsToMany(Call, {
  through: CallResult,
  as: "calls",
  foreignKey: "result_option_id",
  otherKey: "call_id",
});

module.exports = Call;
