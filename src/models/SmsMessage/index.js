const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const Admin = require("../Admin");
const User = require("../User");

const SmsMessage = sequelize.define("SmsMessage", {
    text: {
        type: DataTypes.TEXT("medium"),
        allowNull: false,
    },
}, {
    tableName: "SmsMessages",
    timestamps: true,
});


// RELATIONS
SmsMessage.belongsTo(Admin, {
    foreignKey: "admin_id",
    as: "admin",
});
SmsMessage.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
});


module.exports = SmsMessage;

