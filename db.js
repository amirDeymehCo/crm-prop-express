const { Sequelize } = require("sequelize");

require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "development"}`
});

console.log(process.env.NODE_ENV)

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || "localhost",
    dialect: "mysql",
    port: process.env.DB_PORT || 3306,
    logging: false,
  }
);

module.exports = sequelize;


////// 