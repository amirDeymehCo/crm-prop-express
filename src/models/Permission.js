// models/Permission.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const Permission = sequelize.define(
  "Permission",
  {
    code: {
      type: DataTypes.STRING(100),
    },
    description: DataTypes.STRING,
    permission_group_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "permission",
  },
);

// Permission.belongsTo(PermissionGroup, {
//   foreignKey: "permission_group_id",
//   as: "Group",
// });

module.exports = Permission;
