const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const UserChallenge = require("./Challenge/UserChallenge");
const User = require("./User");
const Admin = require("./Admin");

const ProfitWithdraw = sequelize.define(
  "ProfitWithdraw",
  {
    amount_usd: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    amount_irr: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    refound_usd: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    refound_irr: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "profit_withdraw",
    timestamps: true,
  },
);

module.exports = ProfitWithdraw;

// ریلیشن‌ها
User.hasMany(ProfitWithdraw, {
  foreignKey: "user_id",
});

ProfitWithdraw.belongsTo(User, {
  foreignKey: "user_id",
});

Admin.hasMany(ProfitWithdraw, {
  foreignKey: "admin_id",
});

ProfitWithdraw.belongsTo(Admin, {
  foreignKey: "admin_id",
});

UserChallenge.hasMany(ProfitWithdraw, {
  foreignKey: "user_challenge_id",
});

ProfitWithdraw.belongsTo(UserChallenge, {
  foreignKey: "user_challenge_id",
});
