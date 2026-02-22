const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Admin = require("./Admin");
const Ticket = require("./Ticket");

const TicketNots = sequelize.define(
  "TicketNots",
  {
    note: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "ticket_nots",
    underscored: true,
  },
);

TicketNots.belongsTo(Admin, { foreignKey: "admin_id" });
Admin.hasMany(TicketNots, { foreignKey: "admin_id" });

TicketNots.belongsTo(Ticket, { foreignKey: "ticket_id" });
Ticket.hasMany(TicketNots, { foreignKey: "ticket_id" });

module.exports = TicketNots;
