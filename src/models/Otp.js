const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const Otp = sequelize.define("Otp", {
  mobile: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("waiting", "verify"),
    allowNull: false,
    defaultValue: "waiting",
  },
});

module.exports = Otp;
