const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const User = require("../User");
const Admin = require("../Admin");
const UserChallenge = require("./UserChallenge");

const AccountInstance = sequelize.define(
    "AccountInstance",
    {
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        user_challenge_id: { type: DataTypes.INTEGER, allowNull: false },

        // 1 = phase1, 2 = phase2, 3 = funded
        phase_index: { type: DataTypes.INTEGER, allowNull: false },

        // برای funded چندمین چرخه است؟ (بعد از payout دوباره funded ساختی)
        cycle_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

        // اطلاعات متاتریدر
        platform: {
            type: DataTypes.ENUM("mt4", "mt5"),
            allowNull: true,
            defaultValue: "mt5",
        },
        mt_login: { type: DataTypes.STRING, allowNull: true },
        mt_server: { type: DataTypes.STRING, allowNull: true },
        mt_group: { type: DataTypes.STRING, allowNull: true },
        in_password: {
            type: DataTypes.STRING,
        },
        mt_password: {
            type: DataTypes.STRING,
        },
        // بالانس شروع این اکانت (ممکنه phase2 = 6000 به جای 10000)
        starting_balance_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: false },

        // بالانس/اکوئیتی کش شده برای نمایش (اختیاری)
        display_balance_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
        display_equity_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: true },

        // snapshot قوانین همین اکانت (خیلی مهم برای اختلاف قوانین بین فازها)
        rules_snapshot: { type: DataTypes.JSON, allowNull: true },

        status: {
            type: DataTypes.ENUM("pending", "active", "failed", "closed"),
            allowNull: false,
            defaultValue: "pending",
        },

        created_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
        activated_at: { type: DataTypes.DATE, allowNull: true },
        closed_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
        tableName: "account_instances",
        underscored: true,
    }
);

// Associations
User.hasMany(AccountInstance, { foreignKey: "user_id" });
AccountInstance.belongsTo(User, { foreignKey: "user_id" });

UserChallenge.hasMany(AccountInstance, { foreignKey: "user_challenge_id" });
AccountInstance.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });

Admin.hasMany(AccountInstance, { foreignKey: "created_by_admin_id", as: "created_accounts" });
AccountInstance.belongsTo(Admin, { foreignKey: "created_by_admin_id", as: "created_by_admin" });

module.exports = AccountInstance;
