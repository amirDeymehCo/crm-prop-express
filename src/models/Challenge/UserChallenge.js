const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");
const { STATUS_USER_CHALLENGE } = require("../../utils/statusList");

const UserChallenge = sequelize.define(
  "UserChallenge",
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    challenge_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    challenge_plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // relation to exact current phase row
    current_phase_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(...STATUS_USER_CHALLENGE),
      allowNull: false,
      defaultValue: "pending_payment",
    },

    current_phase_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },

    // selected platform at purchase time
    platform: {
      type: DataTypes.ENUM("mt4", "mt5", "ctrader"),
      allowNull: false,
      defaultValue: "mt5",
    },

    funded_cycle_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    ended_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // insurance
    has_insurance: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    insurance_fee_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },

    insurance_status: {
      type: DataTypes.ENUM("none", "active", "used", "cancelled"),
      allowNull: false,
      defaultValue: "none",
    },

    // pricing snapshot
    price_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },

    discount_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
    },

    final_price_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },

    coupon_code_snapshot: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // floating risk snapshot
    floating_risk_enabled: {
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

    floating_risk_base_on: {
      type: DataTypes.ENUM("starting_balance", "current_balance"),
      allowNull: true,
    },

    floating_risk_max_risk_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },

    // full immutable snapshot
    rules_snapshot: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "user_challenges",
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["admin_id"] },
      { fields: ["challenge_type_id"] },
      { fields: ["challenge_plan_id"] },
      { fields: ["current_phase_id"] },
      { fields: ["status"] },
      { fields: ["platform"] },
      { fields: ["user_id", "status"] },
    ],
  },
);

module.exports = UserChallenge;
