// models/PermissionGroup.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Permission = require("./Permission");
const Admin = require("./Admin");

const PermissionGroup = sequelize.define("PermissionGroup", {
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    is_system: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
});



PermissionGroup.belongsToMany(Permission, {
    through: "permissiongroup_permissions",
    foreignKey: "group_id",
});
Permission.belongsToMany(PermissionGroup, {
    through: "permissiongroup_permissions",
    foreignKey: "permission_id",
});


module.exports = PermissionGroup;
