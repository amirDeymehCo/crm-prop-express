// models/ChallengeType.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const ChallengeRejection = require("../ChallengeRejection");

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

ChallengeType.hasMany(ChallengeRejection, {
  foreignKey: "challenge_type_id",
  as: "rejections",
});
ChallengeRejection.belongsTo(ChallengeType, {
  foreignKey: "challenge_type_id",
  as: "rejections",
});

module.exports = ChallengeType;
