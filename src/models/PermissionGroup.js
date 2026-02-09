// models/PermissionGroup.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Permission = require("./Permission");

const PermissionGroup = sequelize.define(
  "PermissionGroup",
  {
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "permissions_group",
  },
);

// PermissionGroup.belongsToMany(Permission, {
//     through: "permissiongroup_permissions",
//     foreignKey: "group_id",
// });
// Permission.belongsToMany(PermissionGroup, {
//     through: "permissiongroup_permissions",
//     foreignKey: "permission_id",
// });

PermissionGroup.hasMany(Permission, {
  foreignKey: "permission_group_id",
  as: "Permissions",
});
Permission.belongsTo(PermissionGroup, {
  foreignKey: "permission_group_id",
});

module.exports = PermissionGroup;
