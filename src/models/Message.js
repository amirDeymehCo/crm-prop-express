const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Ticket = require("./Ticket");

const Message = sequelize.define("Message", {
    text: {
        type: DataTypes.TEXT("medium"),
        allowNull: false,
    },
    senderType: {
        type: DataTypes.ENUM("admin", "user"),
        allowNull: false,
        defaultValue: "user",
    },
    files: {
        type: DataTypes.JSON, // اینجا آرایه/آبجکت ذخیره میشه
        allowNull: true,
        defaultValue: [],
    },
    ticket_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
}, {
    // اختیاری ولی بهتره شفاف باشه
    tableName: "Messages",
    timestamps: true, // اگر تایم‌استمپ نمی‌خوای بزار false
});

module.exports = Message;

// RELATIONS
Message.belongsTo(Ticket, { foreignKey: "ticket_id" });
Ticket.hasMany(Message, { foreignKey: "ticket_id" });
