// models/Permission.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const PermissionGroup = require("./PermissionGroup");

const Permission = sequelize.define("Permission", {
    code: {
        type: DataTypes.STRING(100),
        unique: true,
        allowNull: false,
    },
    description: DataTypes.STRING,
});



module.exports = Permission;
