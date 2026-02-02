const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");
const UserChallenge = require("./Challenge/UserChallenge");
const Admin = require("./Admin");

const Ticket = sequelize.define(
  "Ticket",
  {
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
      defaultValue: "ticket",
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
      type: DataTypes.ENUM(
        "technical",
        "liveAccount",
        "challenges",
        "request_widthdraw",
        "real_account",
        "kyc",
      ),
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
        // kyc
        "kvc_pending",
        "kyc_closed",
        "kvc_approved",
        // widthdraw
        "widthdraw_requsted",
        "widthdraw_payed",
        "widthdraw_failed",
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
    createdByAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "Tickets",
    timestamps: true,
  },
);

// RELATIONS
User.hasMany(Ticket, { foreignKey: "user_id" });
Ticket.belongsTo(User, { foreignKey: "user_id" });

Admin.hasMany(Ticket, { foreignKey: "admin_id" });
Ticket.belongsTo(Admin, { foreignKey: "admin_id" });

Ticket.belongsTo(UserChallenge, {
  foreignKey: "userChallenge",
  as: "challenge",
});
UserChallenge.hasMany(Ticket, { foreignKey: "userChallenge", as: "tickets" });

module.exports = Ticket;
