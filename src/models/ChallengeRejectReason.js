const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

// لیست ثابت دلایل

const ChallengeRejectReason = sequelize.define(
  "ChallengeRejectReason",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING, // risk | behavior | technical
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "challenge_reject_reasons",
    // underscored: true,
    // timestamps: false,
  },
);

module.exports = ChallengeRejectReason;
