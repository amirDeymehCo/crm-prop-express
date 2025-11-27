const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");

const Ticket = sequelize.define("Ticket", {
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User, // مدل User، نه اسم جدول
            key: "id",
        },
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
            "ticket_in_review"
        ),
        allowNull: false,
        defaultValue: "ticket_open",
    },
}, {
    tableName: "Tickets",
    timestamps: true,
});

module.exports = Ticket;


// RELATIONS
User.hasMany(Ticket, { foreignKey: "user_id" });
Ticket.belongsTo(User, { foreignKey: "user_id" });
