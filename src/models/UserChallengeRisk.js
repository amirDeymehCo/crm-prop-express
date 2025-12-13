const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const UserChallenge = require("./Challenge/UserChallenge");

const UserChallengeRisk = sequelize.define("UserChallengeRisk", {
    is_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    type: { // percent | fixed
        type: DataTypes.ENUM("percent", "fixed"),
        defaultValue: "percent",
    },
    value: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 1,
    },
    base_on: { // starting_balance | current_balance
        type: DataTypes.ENUM("starting_balance", "current_balance"),
        defaultValue: "current_balance",
    },

    last_base_balance_usd: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true
    },

    max_risk_amount_usd: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true
    }
});

UserChallenge.hasOne(UserChallengeRisk, { foreignKey: "user_challenge_id" });
UserChallengeRisk.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });

module.exports = UserChallengeRisk;
