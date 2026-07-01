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
  status: {
    type: DataTypes.ENUM("waiting", "verify", "canceled"),
    allowNull: false,
    defaultValue: "waiting",
  },
});

// RELATIONS
User.hasMany(WidthdrawRequest, { foreignKey: "user_id" });
WidthdrawRequest.belongsTo(User, { foreignKey: "user_id" });

module.exports = WidthdrawRequest;
