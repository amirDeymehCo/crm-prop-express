const sequelize = require("../../../db");
const { DataTypes } = require("sequelize");


// models/CallResult.js
const CallResult = sequelize.define(
    "CallResult",
    {
        call_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        result_option_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    },
    {
        tableName: "call_results",
        underscored: true,
    }
);


module.exports = CallResult