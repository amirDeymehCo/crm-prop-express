const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const AccountInstance = sequelize.define(
  "AccountInstance",
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    user_challenge_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // 1 = phase1, 2 = phase2, 3 = funded
    phase_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isIn: [[1, 2, 3]],
      },
    },

    // for funded cycles
    cycle_no: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },

    // selected execution platform
    platform: {
      type: DataTypes.ENUM("mt4", "mt5", "ctrader"),
      allowNull: false,
      defaultValue: "mt5",
    },

    // generic fields
    platform_login: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    platform_server: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    platform_group: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    platform_password: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    investor_password: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // extra data per platform
    // example for ctrader:
    // {
    //   "account_id": "123456",
    //   "ctid": "mail@example.com",
    //   "broker": "MyProp",
    //   "access_type": "demo"
    // }
    platform_extra: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    // legacy MT fields - keep temporarily for backward compatibility
    mt_login: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    mt_server: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    mt_group: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    in_password: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    mt_password: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    starting_balance_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },

    display_balance_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },

    display_equity_usd: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },

    rules_snapshot: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM("pending", "active", "failed", "closed"),
      allowNull: false,
      defaultValue: "pending",
    },

    created_by_admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    activated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    closed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "account_instances",
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["user_challenge_id"] },
      { fields: ["phase_index"] },
      { fields: ["cycle_no"] },
      { fields: ["platform"] },
      { fields: ["status"] },
      { fields: ["created_by_admin_id"] },
      { fields: ["user_challenge_id", "phase_index", "cycle_no"] },
    ],
  },
);

module.exports = AccountInstance;
