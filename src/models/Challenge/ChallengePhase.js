const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const ChallengePhase = sequelize.define(
  "ChallengePhase",
  {
    challenge_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    challenge_plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    phase_index: {
      // 1 = phase1, 2 = phase2, 3 = funded
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isIn: [[1, 2, 3]],
      },
    },

    // legacy/default group
    group: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    platform: {
      type: DataTypes.ENUM("mt5", "ctrader"),
      allowNull: true,
      defaultValue: "ctrader",
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    duration_days: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    min_trading_days: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    max_daily_drawdown_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    max_overall_drawdown_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    profit_target_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    balance_override: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },

    phase_fee_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },

    phase_fee_irr: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: "challengephases",
    // underscored: true,
    // timestamps: false,
    indexes: [
      { fields: ["challenge_type_id"] },
      { fields: ["challenge_plan_id"] },
      { fields: ["challenge_plan_id", "phase_index"] },
    ],
  },
);

module.exports = ChallengePhase;
