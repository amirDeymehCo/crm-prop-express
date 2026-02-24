const express = require("express");
const cors = require("cors");
const sequelize = require("../db");
const router = require("./routes");
const { globalLimiter } = require("./middlewares/rateLimit");
const cleanQuery = require("./middlewares/cleanQuery");
const initRbac = require("./configs/permissionsInit");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 8000;

require("./crons/UpdateDollarPrice");

// پشت پراکسی/داکر
app.set("trust proxy", 1);

// بهتره cors قبل از limiter باشه (اختیاری)
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.options("*", cors());

app.use(globalLimiter);
app.use(cleanQuery);

// اگر cors رو بالا گذاشتی، این هدرهای دستی معمولاً اضافه‌ان.
// ولی اگر می‌خوای نگه داری، مشکلی نیست:
// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
//   res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
//   next();
// });

// routes and middlewares
app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// app.use("/public", (req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
//   res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
//   next();
// });

app.use(express.static("public"));
app.use("/api", router);

// --------- ✅ DB WAIT / RETRY ----------
async function waitForDb(sequelizeInstance, opts = {}) {
  const {
    retries = Number(process.env.DB_RETRIES || 20),
    delayMs = Number(process.env.DB_RETRY_DELAY_MS || 3000),
  } = opts;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelizeInstance.authenticate();
      console.log("✅ DB Connected");
      return;
    } catch (err) {
      const isLast = attempt === retries;
      console.log(
        `⏳ DB not ready (${attempt}/${retries}) - retry in ${delayMs}ms`,
      );
      if (isLast) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

(async () => {
  try {
    await waitForDb(sequelize);

    // ⚠️ در پروداکشن alter خطرناکه؛ کنترلش با env
    const shouldSync = process.env.DB_SYNC === "true";
    const syncAlter = process.env.DB_SYNC_ALTER === "true";

    if (shouldSync) {
      await sequelize.sync(syncAlter ? { alter: true } : {});
      console.log("✅ DB Sync done");
    }

    // await initRbac();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err?.message || err);
    process.exit(1);
  }
})();
