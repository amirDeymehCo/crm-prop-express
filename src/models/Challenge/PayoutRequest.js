const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const User = require("../User");
const Admin = require("../Admin");
const UserChallenge = require("./UserChallenge");
const AccountInstance = require("./AccountInstance");

const PayoutRequest = sequelize.define(
    "PayoutRequest",
    {
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        user_challenge_id: { type: DataTypes.INTEGER, allowNull: false },
        account_instance_id: { type: DataTypes.INTEGER, allowNull: false }, // funded account

        amount_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: false },

        status: {
            type: DataTypes.ENUM("pending", "approved", "paid", "rejected", "cancelled"),
            allowNull: false,
            defaultValue: "pending",
        },

        note_user: { type: DataTypes.TEXT("medium"), allowNull: true },
        note_admin: { type: DataTypes.TEXT("medium"), allowNull: true },
        reject_reason: { type: DataTypes.TEXT("medium"), allowNull: true },

        reviewed_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
        reviewed_at: { type: DataTypes.DATE, allowNull: true },

        paid_at: { type: DataTypes.DATE, allowNull: true },

        // اگر پرداختت از مسیر walletTransactions یا payments انجام میشه، اینها رو نگه دار
        payment_id: { type: DataTypes.INTEGER, allowNull: true },          // جدول Payment خودت
        wallet_transaction_id: { type: DataTypes.INTEGER, allowNull: true } // جدول WalletTransaction خودت
    },
    {
        tableName: "payout_requests",
        underscored: true,
    }
);

// Associations
User.hasMany(PayoutRequest, { foreignKey: "user_id" });
PayoutRequest.belongsTo(User, { foreignKey: "user_id" });

UserChallenge.hasMany(PayoutRequest, { foreignKey: "user_challenge_id" });
PayoutRequest.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });

AccountInstance.hasMany(PayoutRequest, { foreignKey: "account_instance_id" });
PayoutRequest.belongsTo(AccountInstance, { foreignKey: "account_instance_id" });

Admin.hasMany(PayoutRequest, { foreignKey: "reviewed_by_admin_id", as: "reviewed_payouts" });
PayoutRequest.belongsTo(Admin, { foreignKey: "reviewed_by_admin_id", as: "reviewed_by_admin" });

module.exports = PayoutRequest;
