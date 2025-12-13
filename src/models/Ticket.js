const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");
const UserChallenge = require("./Challenge/UserChallenge");

const Ticket = sequelize.define("Ticket", {
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User, // مدل User، نه اسم جدول
            key: "id",
        },
    },
    type: {
        type: DataTypes.ENUM("ticket", "widthdraw", "kyc"),
        allowNull: false,
        defaultValue: "ticket"
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    files: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    steep_kvc: {
        type: DataTypes.ENUM("steep1", "steep2"),
        allowNull: true,
    },
    departeman: {
        type: DataTypes.ENUM("technical", "liveAccount", "challenges"),
        allowNull: false,
    },
    priority: {
        type: DataTypes.ENUM("low", "medium", "hight"),
        allowNull: false,
    },
    closed_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM(
            "ticket_open",
            "ticket_closed",
            "ticket_answered",
            "ticket_in_review",
            "ticket_waiting_payout",
            "ticket_waiting_interview",
            "kvc_pending",
            "kyc_closed",
            "kvc_approved"
        ),
        allowNull: false,
        defaultValue: "ticket_open",
    },
    userChallenge: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: UserChallenge,
            key: "id",
        },
    },
}, {
    tableName: "Tickets",
    timestamps: true,
});


// RELATIONS
User.hasMany(Ticket, { foreignKey: "user_id" });
Ticket.belongsTo(User, { foreignKey: "user_id" });


module.exports = Ticket;



// "تیکت_باز"،
// "تیکت_بسته"،
// "تیکت_پاسخ_داده شده"،
// "تیکت_در_حال_بررسی"،
// "تیکت_در_انتظار_پرداخت"،
// "تیکت_در_انتظار_مصاحبه"
// 