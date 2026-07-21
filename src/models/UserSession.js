const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");

const UserSession = sequelize.define(
  "UserSession",
  {
    refresh_token_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    device: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "user_sessions",
    // underscored: true,
    // timestamps: false,
  },
);

UserSession.belongsTo(User, { foreignKey: "user_id" });
User.hasMany(UserSession, { foreignKey: "user_id" });

module.exports = UserSession;
