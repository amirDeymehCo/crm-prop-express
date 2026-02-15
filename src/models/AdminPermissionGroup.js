const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Admin = require("./Admin");
const PermissionGroup = require("./PermissionGroup");

const AdminPermissionGroup = sequelize.define(
  "AdminPermissionGroup",
  {
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    group_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "admin_permissiongroups",
    timestamps: false,
  },
);

Admin.belongsToMany(PermissionGroup, {
  through: AdminPermissionGroup,
  foreignKey: "admin_id",
  otherKey: "group_id",
});

PermissionGroup.belongsToMany(Admin, {
  through: AdminPermissionGroup,
  foreignKey: "group_id",
  otherKey: "admin_id",
});

module.exports = AdminPermissionGroup;
