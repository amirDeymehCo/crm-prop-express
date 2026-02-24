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

  code_hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("waiting", "verify", "expired"),
    allowNull: false,
    defaultValue: "waiting",
  },
});

module.exports = Otp;
