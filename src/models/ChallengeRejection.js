const sequelize = require("../../db");
const { DataTypes } = require("sequelize");
const Admin = require("./Admin");

const ChallengeRejection = sequelize.define(
  "ChallengeRejection",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    description: {
      type: DataTypes.TEXT,
    },
  },
  {
    tableName: "challenge_rejections",
    // underscored: true,
    // timestamps: false,
  },
);

ChallengeRejection.belongsTo(Admin, {
  foreignKey: "admin_id",
  as: "admin",
});
Admin.hasMany(ChallengeRejection, {
  foreignKey: "admin_id",
  as: "admin",
});

module.exports = ChallengeRejection;
