const { DataTypes } = require("sequelize");
const sequelize = require("../../db");

const Coupon = sequelize.define("Coupon", {
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    type: {                        // درصدی یا مبلغ ثابت
        type: DataTypes.ENUM("percent", "fixed"),
        allowNull: false,
    },
    value: {                       // مثلا 70 یعنی 70% یا 70 دلار
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    max_uses: {                    // حداکثر تعداد استفاده کلی
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    max_uses_per_user: {           // حداکثر برای هر کاربر
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    used_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    valid_from: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    valid_to: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    min_order_amount_usd: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },

    // برای محدودکردن روی یک نوع چالش یا پلن خاص
    challenge_type_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    challenge_plan_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
});



module.exports = Coupon;

