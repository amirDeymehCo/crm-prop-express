const express = require("express");
const cors = require("cors");
const sequelize = require("../db");
const router = require("./routes");
const { globalLimiter } = require("./middlewares/rateLimit");
const initRbac = require("./configs/permissionsInit");
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

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true }); // اگر از migrations استفاده می‌کنی، همون migrate خودت
    await initRbac();

    console.log("DB Connected...")
    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();