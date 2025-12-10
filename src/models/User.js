const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const bcrypt = require("bcrypt");

const User = sequelize.define(
  "User",
  {
    firstname: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastname: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mobile: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    verify_mobile: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "approved",
    },
  },
  {
    hooks: {
      beforeCreate: async (user, options) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user, options) => {
        if (user.changed("password")) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      afterCreate: async (user, options) => {
        const t = options.transaction;

        // ✅ اینجا lazy require کن تا حلقه‌ی require پیش نیاد
        const Wallet = require("./Wallet");

        await Wallet.create(
          {
            user_id: user.id,
            balance: 0,
            currency: "USD",
          },
          t ? { transaction: t } : {}
        );
      }
    },
  }
);


User.prototype.verifyPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = User;
