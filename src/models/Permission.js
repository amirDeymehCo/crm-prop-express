// models/Permission.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const PermissionGroup = require("./PermissionGroup");

const Permission = sequelize.define("Permission", {
    code: {
        type: DataTypes.STRING(100),
    },
    description: DataTypes.STRING,
});



module.exports = Permission;
