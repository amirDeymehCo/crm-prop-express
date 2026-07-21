const sequelize = require("../../db");
const { DataTypes } = require("sequelize");
const ChallengeRejection = require("./ChallengeRejection");
const ChallengeRejectReason = require("./ChallengeRejectReason");

const ChallengeRejectionItem = sequelize.define(
  "ChallengeRejectionItem",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    challenge_rejection_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reason_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "challenge_rejection_items",
    // underscored: true,
    // timestamps: false,
  },
);

ChallengeRejectionItem.belongsTo(ChallengeRejection, {
  foreignKey: "challenge_rejection_id",
});

ChallengeRejectionItem.belongsTo(ChallengeRejectReason, {
  foreignKey: "reason_id",
  as: "reason",
});
ChallengeRejection.hasMany(ChallengeRejectionItem, {
  foreignKey: "challenge_rejection_id",
  as: "items",
  onDelete: "CASCADE",
});

module.exports = ChallengeRejectionItem;
