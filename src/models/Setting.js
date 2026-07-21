// models/Setting.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const Setting = sequelize.define(
  "Setting",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    dollar_price: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "setting",
    // underscored: true,
    // timestamps: false,
  },
);

module.exports = Setting;
