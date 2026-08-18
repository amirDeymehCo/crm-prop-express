const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");

const WidthdrawRequest = sequelize.define("WidthdrawRequest", {
  amount: {
    type: DataTypes.DECIMAL(18, 4),
    allowNull: false,
  },
  wallet_address: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "",
  },
  is_canceled: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM(
      "waiting",
      "verify",
      "canceled",
      "reuqest_waiting",
      "request_prograssing",
      "request_pending_paid",
      "request_paid",
      "request_canceled",
    ),
    allowNull: false,
    defaultValue: "waiting",
  },
});

// RELATIONS
User.hasMany(WidthdrawRequest, { foreignKey: "user_id" });
WidthdrawRequest.belongsTo(User, { foreignKey: "user_id" });

module.exports = WidthdrawRequest;
