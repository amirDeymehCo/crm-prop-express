const { Sequelize } = require("sequelize");
require("dotenv").config();

console.log({
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
});

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "mysql",
    port: Number(process.env.DB_PORT),
    // logging: console.log,

    logging: false,

    dialectOptions: {
      connectTimeout: 10000,
    },
  },
);

module.exports = sequelize;
