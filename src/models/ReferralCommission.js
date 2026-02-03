const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");
const Order = require("./Order");

const ReferralCommission = sequelize.define("ReferralCommission", {
  referrer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  referred_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  order_amount: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
  },
  commission_amount: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("pending", "approved", "paid"),
    defaultValue: "pending",
  },
});

ReferralCommission.belongsTo(User, {
  foreignKey: "referrer_id",
  as: "referrer",
});

ReferralCommission.belongsTo(User, {
  foreignKey: "referred_user_id",
  as: "referredUser",
});

ReferralCommission.belongsTo(Order, {
  foreignKey: "order_id",
  as: "order",
});

module.exports = ReferralCommission;
