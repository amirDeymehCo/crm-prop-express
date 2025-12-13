const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const User = require("../User");
const Admin = require("../Admin");
const UserChallenge = require("./UserChallenge");
const AccountInstance = require("./AccountInstance");

const PhaseTransitionRequest = sequelize.define(
    "PhaseTransitionRequest",
    {
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        user_challenge_id: { type: DataTypes.INTEGER, allowNull: false },

        // درخواست از کدام فاز به کدام فاز؟
        from_phase: { type: DataTypes.INTEGER, allowNull: false },
        to_phase: { type: DataTypes.INTEGER, allowNull: false },

        // روی کدام اکانت بررسی شده؟ (معمولاً اکانت فعلی همان فاز)
        account_instance_id: { type: DataTypes.INTEGER, allowNull: true },

        status: {
            type: DataTypes.ENUM("pending", "approved", "rejected", "cancelled"),
            allowNull: false,
            defaultValue: "pending",
        },

        note_user: { type: DataTypes.TEXT("medium"), allowNull: true }, // توضیح کاربر
        note_admin: { type: DataTypes.TEXT("medium"), allowNull: true }, // توضیح ادمین
        reject_reason: { type: DataTypes.TEXT("medium"), allowNull: true },

        reviewed_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
        reviewed_at: { type: DataTypes.DATE, allowNull: true },

        // اگر تایید شد و نیاز به پرداخت فاز بعد بود، اینجا order_id رو نگه دار (اختیاری)
        order_id: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
        tableName: "phase_transition_requests",
        underscored: true,
    }
);

// Associations
User.hasMany(PhaseTransitionRequest, { foreignKey: "user_id" });
PhaseTransitionRequest.belongsTo(User, { foreignKey: "user_id" });

UserChallenge.hasMany(PhaseTransitionRequest, { foreignKey: "user_challenge_id" });
PhaseTransitionRequest.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });

AccountInstance.hasMany(PhaseTransitionRequest, { foreignKey: "account_instance_id" });
PhaseTransitionRequest.belongsTo(AccountInstance, { foreignKey: "account_instance_id" });

Admin.hasMany(PhaseTransitionRequest, { foreignKey: "reviewed_by_admin_id", as: "reviewed_phase_requests" });
PhaseTransitionRequest.belongsTo(Admin, { foreignKey: "reviewed_by_admin_id", as: "reviewed_by_admin" });

module.exports = PhaseTransitionRequest;
