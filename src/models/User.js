const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

function genReferralCode() {
  return "MP-" + crypto.randomBytes(4).toString("hex").toUpperCase(); // MP-9AF31C2D
}

async function genUniqueReferralCode(sequelize) {
  for (let i = 0; i < 10; i++) {
    const code = genReferralCode();
    const exists = await sequelize.models.User.findOne({
      where: { referral_code: code },
      attributes: ["id"],
    });
    if (!exists) return code;
  }
  // اگر خیلی نادر collision خورد، طول رو بیشتر می‌کنیم
  return "MP-" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

const User = sequelize.define(
  "User",
  {
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
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
      defaultValue: false,
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
    kyc_steep: {
      type: DataTypes.ENUM("one", "two"),
      allowNull: true,
      defaultValue: null,
    },
    kyc_status: {
      type: DataTypes.ENUM("not_sended", "pending", "rejected", "approved"),
      allowNull: true,
      defaultValue: "not_sended",
    },
    referrer_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    referral_code: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
  },
  {
    hooks: {
      beforeCreate: async (user, options) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }

        if (!user.referral_code) {
          user.referral_code = await genUniqueReferralCode(sequelize);
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
          t ? { transaction: t } : {},
        );
      },
    },
  },
);

User.prototype.verifyPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

User.hasMany(User, {
  foreignKey: "referrer_id",
  as: "referrals",
});

User.belongsTo(User, {
  foreignKey: "referrer_id",
  as: "referrer",
});

module.exports = User;
