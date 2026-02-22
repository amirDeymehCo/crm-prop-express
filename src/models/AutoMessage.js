const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const AutoMessage = sequelize.define("AutoMessage", {
  tag: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  text: {
    type: DataTypes.TEXT("medium"),
    allowNull: false,
  },
});

module.exports = AutoMessage;
