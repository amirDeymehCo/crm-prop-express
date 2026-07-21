// models/ChallengeType.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const Admin = require("../Admin");
const ChallengePlan = require("./ChallengePlan");
const UserChallenge = require("./UserChallenge");

const HistoryChallenge = sequelize.define(
  "HistoryChallenge",
  {
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(
        "change_status",
        "change_risk",
        "challenge_rejected",
      ),
    },
  },
  {
    tableName: "history_challenge",
    // underscored: true,
    // timestamps: false,
  },
);

HistoryChallenge.belongsTo(Admin, {
  foreignKey: "admin_id",
});
UserChallenge.hasMany(HistoryChallenge, { foreignKey: "user_challenge_id" });
HistoryChallenge.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });

module.exports = HistoryChallenge;
