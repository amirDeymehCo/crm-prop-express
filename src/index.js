const express = require("express");
const cors = require("cors");
const sequelize = require("../db");
const router = require("./routes");
const { globalLimiter } = require("./middlewares/rateLimit");
const app = express();
const PORT = process.env.PORT || 8000;
require("./crons/UpdateDollarPrice");


// app.use(helmet());
// app.use(bodyParser.json());
// CORS Error
app.set('trust proxy', 1);
app.use(globalLimiter);
app.use(cors());
app.options("*", cors());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // یا دامنه خودت رو بزار
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// routes and middlewares
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/public", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.use(express.static("public"));
app.use("/api", router);

sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("Database synced");
  })
  .catch((err) => console.error("Database sync failed: ", err));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


