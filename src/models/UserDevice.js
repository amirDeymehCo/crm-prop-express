const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const UserDevice = sequelize.define(
  "UserDevice",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },

    device_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    device_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    browser: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    os: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    indexes: [
      {
        fields: ["user_id"],
      },
      {
        fields: ["ip"],
      },
    ],
  },
);

module.exports = UserDevice;
