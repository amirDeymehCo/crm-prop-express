const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const Otp = sequelize.define("Otp", {
  mobile: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  code_hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("waiting", "verify", "expired"),
    allowNull: false,
    defaultValue: "waiting",
  },
});

module.exports = Otp;
