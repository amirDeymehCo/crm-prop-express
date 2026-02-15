const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const UserChallenge = require("./Challenge/UserChallenge");
const User = require("./User");

const Certificates = sequelize.define(
  "Certificates",
  {
    url_file: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM("steep1", "steep2", "withdraw"),
      allowNull: false,
    },
    fullname: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    total_profit: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    withdraw_profit: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "certificates",
    timestamps: true,
  },
);

module.exports = Certificates;

UserChallenge.hasMany(Certificates, { foreignKey: "userChallengeId" });
Certificates.belongsTo(UserChallenge, {
  foreignKey: "userChallengeId",
});

User.hasMany(Certificates, { foreignKey: "user_id" });
Certificates.belongsTo(User, {
  foreignKey: "user_id",
});
