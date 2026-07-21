const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const ChallengePlan = sequelize.define(
  "ChallengePlan",
  {
    challenge_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    balance: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },

    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "USD",
    },

    leverage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },

    price_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },

    price_irr: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    profit_share_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 80,
    },

    max_daily_drawdown_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    max_overall_drawdown_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    // available platforms for this plan
    available_platforms: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ["mt5"],
    },

    // insurance
    allow_insurance: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    insurance_fee_type: {
      type: DataTypes.ENUM("percent_of_price", "percent_of_balance", "fixed"),
      allowNull: true,
    },

    insurance_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    // floating risk
    has_floating_risk: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    floating_risk_type: {
      type: DataTypes.ENUM("percent", "fixed"),
      allowNull: true,
    },

    floating_risk_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    floating_risk_fee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    floating_risk_base_on: {
      type: DataTypes.ENUM("starting_balance", "current_balance"),
      allowNull: true,
    },
  },
  {
    tableName: "challengeplans",
    // underscored: true,
    // timestamps: false,
    indexes: [
      { fields: ["challenge_type_id"] },
      { fields: ["challenge_type_id", "balance"] },
      { fields: ["is_active"] },
    ],
  },
);

module.exports = ChallengePlan;
