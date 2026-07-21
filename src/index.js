const path = require("path");
const fs = require("fs");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const pino = require("pino");
const pinoHttp = require("pino-http");

const sequelize = require("../db");
const router = require("./routes");

const { globalLimiter } = require("./middlewares/rateLimit");
const cleanQuery = require("./middlewares/cleanQuery");
const initRbac = require("./configs/permissionsInit");

const setupChallengeAssociations = require("./models/Challenge/setupAssociations");

require("./crons/UpdateDollarPrice");
// const smartCache = require("./middlewares/smartCache");

const app = express();

const PORT = Number(process.env.PORT || 8000);
const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

/**
 * اگر پشت Nginx / Load Balancer هستی، این مورد مهم است.
 * برای rate-limit، secure cookies و تشخیص IP واقعی کاربرد دارد.
 */
if (isProduction) {
  app.set("trust proxy", 1);
}

/**
 * حذف header پیش‌فرض Express
 */
app.disable("x-powered-by");

// اطمینان از وجود پوشه logs
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * تنظیم لایبرری Pino برای نوشتن در فایل
 * فیلترها و سانسور اطلاعات حساس در اینجا تعریف شده‌اند
 */
const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.currentPassword",
        "req.body.newPassword",
        "req.body.confirmPassword",
        "req.body.token",
        "req.body.accessToken",
        "req.body.refreshToken",
        "req.body.otp",
        "req.body.code",
        "res.headers.set-cookie",
      ],
      censor: "[REDACTED]",
    },
  },
  pino.destination(path.join(logsDir, "app.log")),
);

/**
 * غیرفعال کردن autoLogging
 * با این کار، به ازای هر درخواست معمولی هیچ لاگی ثبت نمی‌شود
 */
app.use(
  pinoHttp({
    logger,
    autoLogging: false,
  }),
);

/**
 * Middleware تشخیص درخواست‌های کند (Slow Requests)
 * فقط در صورتی که زمان پاسخ‌دهی از حد مجاز بیشتر شود، لاگ ثبت می‌کند.
 */
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const slowThresholdMs = Number(process.env.SLOW_REQUEST_MS || 1000); // پیش‌فرض ۱ ثانیه

    if (duration >= slowThresholdMs) {
      req.log.warn(
        {
          type: "slow-request",
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          responseTime: `${duration}ms`,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
        `Slow request: ${req.method} ${req.originalUrl || req.url} took ${duration}ms`,
      );
    }
  });

  next();
});

/**
 * Security Headers
 */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "same-site",
    },
    contentSecurityPolicy: false,
  }),
);

/**
 * HSTS فقط در production فعال شود.
 * اگر روی localhost یا محیط dev فعال شود، گاهی دردسرساز می‌شود.
 */
if (isProduction) {
  app.use(
    helmet.hsts({
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: false,
    }),
  );
}

/**
 * CORS
 */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",

  /**
   * اگر واقعاً در local با HTTPS کار می‌کنی نگه دار،
   * وگرنه ضرورتی ندارد.
   */
  "https://localhost:3000",
  "https://localhost:3001",

  /**
   * Production
   */
  "https://myprop.trade",
  "https://crm.myprop.trade",
];

/**
 * در development می‌توانی HTTP دامنه اصلی را هم موقتاً مجاز کنی،
 * ولی در production بهتر است فقط HTTPS مجاز باشد.
 */
if (!isProduction) {
  allowedOrigins.push("http://myprop.trade");
  allowedOrigins.push("http://crm.myprop.trade");
}

const corsOptions = {
  origin(origin, callback) {
    /**
     * درخواست‌هایی مثل curl، Postman، server-to-server و health-check
     * معمولاً origin ندارند.
     */
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`), false);
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],

  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/**
 * Cookie parser
 */
app.use(cookieParser());

/**
 * Body parsers
 *
 * اگر واقعاً JSON حجیم نداری، 30mb زیاد است.
 * پیشنهاد: 1mb تا 5mb
 * برای upload بهتر است از multipart/form-data و multer/object storage استفاده شود.
 */
app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "2mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.URLENCODED_BODY_LIMIT || "1mb",
  }),
);

/**
 * Global Rate Limit
 *
 * بهتر است بعد از trust proxy و قبل از routeها باشد.
 */
app.use(globalLimiter);

/**
 * پاکسازی query string
 */
app.use(cleanQuery);

/**
 * Slow Request Logger
 */
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    const slowThresholdMs = Number(process.env.SLOW_REQUEST_MS || 1000);

    if (duration >= slowThresholdMs) {
      req.log.warn(
        {
          type: "slow-request",
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          responseTime: duration,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
        `Slow request detected: ${req.method} ${
          req.originalUrl || req.url
        } ${res.statusCode} - ${duration}ms`,
      );
    }
  });

  next();
});

/**
 * Static Files
 *
 * اگر public داری، کمی محدودترش کن.
 */
app.use(
  express.static(path.join(process.cwd(), "public"), {
    dotfiles: "deny",
    index: false,
    maxAge: isProduction ? "1d" : 0,
    fallthrough: true,
  }),
);

/**
 * Health Check
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    env: NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * API Routes
 */
app.use("/api", router);

/**
 * 404 Handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/**
 * Error Handler
 *
 * نکته:
 * در production نباید stack trace یا جزئیات داخلی به کاربر برگردد.
 */
app.use((err, req, res, next) => {
  req.log?.error(
    {
      err,
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    },
    err.message || "Unhandled error",
  );

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    success: false,
    message: isProduction
      ? statusCode >= 500
        ? "Internal server error"
        : err.message || "Request failed"
      : err.message || "Internal server error",

    ...(isProduction
      ? {}
      : {
          stack: err.stack,
        }),
  });
});

/**
 * DB WAIT / RETRY
 */
async function waitForDb(sequelizeInstance, opts = {}) {
  const retries = Number(opts.retries || process.env.DB_RETRIES || 20);
  const delayMs = Number(opts.delayMs || process.env.DB_RETRY_DELAY_MS || 3000);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await sequelizeInstance.authenticate();

      logger.info("DB Connected");

      return;
    } catch (err) {
      const isLast = attempt === retries;

      logger.warn(
        {
          attempt,
          retries,
          delayMs,
          error: err.message,
        },
        `DB not ready (${attempt}/${retries}) - retry in ${delayMs}ms`,
      );

      if (isLast) {
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Start Server
 */
let server;

async function startServer() {
  try {
    await waitForDb(sequelize);
    setupChallengeAssociations();

    /**
     * خیلی مهم:
     * sequelize.sync({ alter: true }) در production ریسک جدی دارد.
     *
     * پیشنهاد:
     * - Development: مجاز
     * - Production: فقط migration
     */
    const shouldSync = process.env.DB_SYNC === "true";
    const syncAlter = process.env.DB_SYNC_ALTER === "true";

    if (shouldSync) {
      if (isProduction && syncAlter) {
        throw new Error(
          "Refusing to run sequelize.sync({ alter: true }) in production.",
        );
      }

      // await sequelize.sync({
      //   alter: false,
      // });
      await sequelize.sync({ alter: true });

      logger.info(
        {
          alter: !isProduction && syncAlter,
        },
        "DB Sync done",
      );
    }

    /**
     * اگر initRbac idempotent است، یعنی چند بار اجرا شود دیتای تکراری نمی‌سازد،
     * می‌توانی فعالش کنی.
     */
    // if (process.env.INIT_RBAC === "true") {
    await initRbac();
    logger.info("RBAC initialized");
    // }

    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(`🚀 Serve running on port ${PORT}`);
    });
  } catch (err) {
    logger.fatal(
      {
        err,
      },
      "Failed to start server",
    );

    console.error("❌ Failed to start server:", err?.message || err);

    process.exit(1);
  }
}

startServer();

/**
 * Graceful Shutdown
 */
async function shutdown(signal) {
  try {
    logger.info({ signal }, "Shutdown signal received");

    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      logger.info("HTTP server closed");
    }

    await sequelize.close();

    logger.info("DB connection closed");

    process.exit(0);
  } catch (err) {
    logger.error(
      {
        err,
      },
      "Error during shutdown",
    );

    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app;
