const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const DBLog = sequelize.define("DBLog", {
  route: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  method: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  time: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

module.exports = DBLog;
