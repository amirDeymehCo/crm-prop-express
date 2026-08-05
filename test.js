const mysql = require("mysql2/promise");

mysql
  .createConnection({
    host: "185.116.161.81",
    port: 3316,
    user: "root",
    password: "database_password@312@312",
    database: "crm_myprop",
    ssl: false,
  })
  .then(() => console.log("connected"))
  .catch(console.log);
