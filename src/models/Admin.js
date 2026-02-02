// models/Admin.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const PermissionGroup = require("./PermissionGroup");
const bcrypt = require("bcrypt");
const User = require("./User");

const Admin = sequelize.define("Admin", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    avatar: DataTypes.STRING,
    name: DataTypes.STRING,
    mobile: { type: DataTypes.STRING, },
    email: { type: DataTypes.STRING, },
    password: DataTypes.STRING,
    is_super_admin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // برای صاحب سیستم
    },
},
    {
        hooks: {
            beforeCreate: async (admin, options) => {
                if (admin.password) {
                    const salt = await bcrypt.genSalt(10);
                    admin.password = await bcrypt.hash(admin.password, salt);
                }
            },
            beforeUpdate: async (admin, options) => {
                if (admin.changed("password")) {
                    const salt = await bcrypt.genSalt(10);
                    admin.password = await bcrypt.hash(admin.password, salt);
                }
            },
        },
    });


Admin.belongsToMany(PermissionGroup, {
    through: "admin_permissiongroups",
    foreignKey: "admin_id",
});
PermissionGroup.belongsToMany(Admin, {
    through: "admin_permissiongroups",
    foreignKey: "group_id",
});
Admin.hasMany(User, {
    as: "users",
    foreignKey: "responsible_admin_id",
});
User.belongsTo(Admin, {
    as: "responsible_admin",
    foreignKey: "responsible_admin_id",
});


Admin.prototype.verifyPassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};


module.exports = Admin;
