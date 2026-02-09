const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Admin = require("./Admin");
const Permission = require("./Permission");

const AdminPermission = sequelize.define("AdminPermission", {
  admin_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  permission_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});

Admin.belongsToMany(Permission, {
  through: AdminPermission,
  foreignKey: "admin_id",
});

Permission.belongsToMany(Admin, {
  through: AdminPermission,
  foreignKey: "permission_id",
});

module.exports = AdminPermission;
