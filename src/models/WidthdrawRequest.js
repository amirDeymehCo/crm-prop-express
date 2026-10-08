const { DataTypes } = require("sequelize");
const sequelize = require("../../db");
const User = require("./User");

const WidthdrawRequest = sequelize.define("WidthdrawRequest", {
  // روش برداشت: ارزی (USDT روی TRC20/BEP20) یا ریالی (واریز به شبا)
  method: {
    type: DataTypes.ENUM("crypto", "irr"),
    allowNull: false,
    defaultValue: "crypto",
  },
  // مبلغ درخواستی به دلار — در هر دو روش از موجودی دلاری ولت کم می‌شود
  amount: {
    type: DataTypes.DECIMAL(18, 4),
    allowNull: false,
  },
  // فقط روش crypto: آدرس ولت مقصد
  // ⚠️ allowNull شد چون در برداشت ریالی آدرس ولتی وجود ندارد
  wallet_address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // فقط روش irr: شماره شبای مقصد به شکل نرمال‌شده (IR + 24 رقم)
  sheba: {
    type: DataTypes.STRING(26),
    allowNull: true,
  },
  // فقط روش irr: نام صاحب حساب که کاربر اعلام کرده (باید با شبا یکی باشد)
  account_holder: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // فقط روش irr: معادل ریالی مبلغ، snapshot شده در لحظه‌ی ثبت درخواست
  // (ریال، نه تومان)
  amount_irr: {
    type: DataTypes.DECIMAL(18, 0),
    allowNull: true,
  },
  // نرخ تومانی هر دلار در لحظه‌ی ثبت درخواست — تا بعداً قابل حسابرسی باشد
  rate_irr_per_usd: {
    type: DataTypes.DECIMAL(18, 4),
    allowNull: true,
  },
  // توضیحات ادمین برای کاربر (در پنل کاربر نمایش داده می‌شود)
  admin_note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // شماره پیگیری/رهگیری واریز بانکی که ادمین بعد از واریز ثبت می‌کند
  payment_reference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "",
  },
  is_canceled: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  },
  is_canceled_reqeust: {
    type: DataTypes.ENUM("1", "0"),
    allowNull: true,
    defaultValue: "0",
  },
  status: {
    type: DataTypes.ENUM(
      "waiting",
      "verify",
      "canceled",
      "reuqest_waiting",
      "request_prograssing",
      "request_pending_paid",
      "request_paid",
      "request_canceled",
    ),
    allowNull: false,
    defaultValue: "waiting",
  },
});

// RELATIONS
User.hasMany(WidthdrawRequest, { foreignKey: "user_id" });
WidthdrawRequest.belongsTo(User, { foreignKey: "user_id" });

module.exports = WidthdrawRequest;
