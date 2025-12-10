// src/models/CallResultOption.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const CallResultOption = sequelize.define(
    "CallResultOption",
    {
        title: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "call_result_options",
        underscored: true,
    }
);

module.exports = CallResultOption;
