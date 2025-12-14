const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const Coupon = require("./Coupon")
const User = require("./User")
const UserChallenge = require("./Challenge/UserChallenge")

// models/CouponUsage.js
const CouponUsage = sequelize.define("CouponUsage", {
    discount_amount_usd: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
    },
});

Coupon.hasMany(CouponUsage, { foreignKey: "coupon_id" });
CouponUsage.belongsTo(Coupon, { foreignKey: "coupon_id" });

User.hasMany(CouponUsage, { foreignKey: "user_id" });
CouponUsage.belongsTo(User, { foreignKey: "user_id" });

UserChallenge.hasOne(CouponUsage, { foreignKey: "user_challenge_id" });
CouponUsage.belongsTo(UserChallenge, { foreignKey: "user_challenge_id" });


module.exports = CouponUsage
