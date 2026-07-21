const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const ChallengeType = sequelize.define(
  "ChallengeType",
  {
    logo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
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
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "challengetypes",
    // underscored: true,
    // timestamps: false,

    indexes: [{ fields: ["name"] }, { fields: ["is_active"] }],
  },
);

module.exports = ChallengeType;
