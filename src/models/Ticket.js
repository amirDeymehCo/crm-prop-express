const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");
const UserChallenge = require("./UserChallenge");

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
        type: DataTypes.ENUM("ticket", "widthdraw"),
        allowNull: false,
        defaultValue: "ticket"
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
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
            "ticket_waiting_interview"
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

module.exports = Ticket;


// RELATIONS
User.hasMany(Ticket, { foreignKey: "user_id" });
Ticket.belongsTo(User, { foreignKey: "user_id" });
