const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const Call = require("./Call");
const Admin = require("../Admin");

// models/CallRejectReason.js
const Note = sequelize.define(
  "Note",
  {
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "note_call",
    // underscored: true,
    // timestamps: false,
  },
);

Call.hasMany(Note, { foreignKey: "call_id" });
Note.belongsTo(Call, { foreignKey: "call_id" });

Admin.hasMany(Note, { foreignKey: "admin_id" });
Note.belongsTo(Admin, { foreignKey: "admin_id" });

module.exports = Note;
