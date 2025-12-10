const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const Call = require("./Call");

// models/CallRejectReason.js
const CallRejectReason = sequelize.define(
    "CallRejectReason",
    {
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    },
    {
        tableName: "call_reject_reasons",
        underscored: true,
    }
);

module.exports = CallRejectReason
