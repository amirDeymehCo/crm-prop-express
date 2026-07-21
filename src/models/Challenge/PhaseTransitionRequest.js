const { DataTypes } = require("sequelize");
const sequelize = require("../../../db");

const PhaseTransitionRequest = sequelize.define(
  "PhaseTransitionRequest",
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    user_challenge_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    from_phase: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isIn: [[1, 2, 3]],
      },
    },

    to_phase: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isIn: [[1, 2, 3]],
      },
    },

    account_instance_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected", "cancelled"),
      allowNull: false,
      defaultValue: "pending",
    },

    note_user: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
    },

    note_admin: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
    },

    reject_reason: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
    },

    reviewed_by_admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // optional payment/order reference for next phase fee
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "phase_transition_requests",
    // underscored: true,
    // timestamps: false,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["user_challenge_id"] },
      { fields: ["account_instance_id"] },
      { fields: ["status"] },
      { fields: ["reviewed_by_admin_id"] },
      { fields: ["user_challenge_id", "status"] },
    ],
  },
);

module.exports = PhaseTransitionRequest;
