// models/ChallengeType.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const ChallengeType = sequelize.define("ChallengeType", {
  logo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  name: {
    // مثلا "چالش پیشرفته"
    type: DataTypes.STRING,
    allowNull: false,
  },
  des: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  shand: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

module.exports = ChallengeType;
