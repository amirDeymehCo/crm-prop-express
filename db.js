const { Sequelize } = require("sequelize");

// فقط برای لوکال (خارج از Docker) لود کن
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: ".env.development" });
}

console.log("NODE_ENV:", process.env.NODE_ENV);

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || "db", // داخل docker بهتره اسم سرویس db باشه
    dialect: "mysql",
    port: Number(process.env.DB_PORT || 3306),
    logging: false,
  }
);

module.exports = sequelize;
