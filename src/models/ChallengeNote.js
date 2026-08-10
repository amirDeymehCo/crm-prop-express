const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Admin = require("./Admin");
const UserChallenge = require("./Challenge/UserChallenge");

const ChallengeNote = sequelize.define(
  "ChallengeNote",
  {
    note: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "challenge_nots",
    // underscored: true,
    // timestamps: false,
  },
);

ChallengeNote.belongsTo(Admin, { foreignKey: "admin_id" });
Admin.hasMany(ChallengeNote, { foreignKey: "admin_id" });

ChallengeNote.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });
UserChallenge.hasMany(ChallengeNote, { foreignKey: "user_challenge_id" });

module.exports = ChallengeNote;
