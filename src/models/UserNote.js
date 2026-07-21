const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Admin = require("./Admin");
const User = require("./User");

const UserNote = sequelize.define(
  "UserNote",
  {
    note: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "user_nots",
    // underscored: true,
    // timestamps: false,
  },
);

UserNote.belongsTo(Admin, { foreignKey: "admin_id" });
Admin.hasMany(UserNote, { foreignKey: "admin_id" });

UserNote.belongsTo(User, { foreignKey: "user_id" });
User.hasMany(UserNote, { foreignKey: "user_id" });

module.exports = UserNote;
