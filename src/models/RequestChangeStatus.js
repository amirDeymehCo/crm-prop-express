const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const UserChallenge = require("./Challenge/UserChallenge");
const User = require("./User");
const Admin = require("./Admin");

const RequestChangeStatus = sequelize.define("RequestChangeStatus", {
    admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user_challenge_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM("pending", "aproved", "failed"),
        allowNull: false,
        defaultValue: "pending"
    },
    messageAdmin: {
        type: DataTypes.TEXT("medium"),
        allowNull: true,
    },
}, {
    tableName: "request_change_status",
    underscored: true,
});

RequestChangeStatus.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });
RequestChangeStatus.belongsTo(User, { foreignKey: "user_id" });
RequestChangeStatus.belongsTo(Admin, { foreignKey: "admin_id" });

module.exports = RequestChangeStatus;

