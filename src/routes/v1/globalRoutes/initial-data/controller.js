const { runFullLegacyMigration } = require("./migrateLegacyUsers");

/**
 * این State فقط در حافظه همین Process نگهداری می‌شود.
 *
 * در صورت Restart شدن Node.js یا اجرای چند Replica،
 * وضعیت از بین می‌رود یا بین Replicaها مشترک نخواهد بود.
 */
const migrationState = {
  isRunning: false,
  status: "idle",

  totalUsers: 0,

  startedAt: null,
  finishedAt: null,

  options: null,
  error: null,
  report: null,
};

/**
 * تبدیل خطا به یک ساختار قابل ذخیره و ارسال
 */
function serializeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || "Unknown migration error.",

    details: error?.details || null,

    stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
  };
}

/**
 * تنظیم State قبل از ارسال پاسخ 202
 *
 * این کار مهم است؛ چون اگر State را داخل setImmediate
 * تغییر دهیم، ممکن است قبل از شروع Background Job،
 * درخواست دوم هم پذیرفته شود.
 */
function reserveMigration({ totalUsers, options }) {
  migrationState.isRunning = true;
  migrationState.status = "accepted";

  migrationState.totalUsers = totalUsers;

  migrationState.startedAt = new Date().toISOString();

  migrationState.finishedAt = null;

  migrationState.options = options;
  migrationState.error = null;
  migrationState.report = null;
}

/**
 * اجرای مستقیم Migration روی داده‌ای که از POST آمده است.
 */
async function executeLegacyUsersMigration(
  legacyUsers,
  {
    batchSize = 500,
    strictCatalogMapping = true,
    sourceSystem = "legacy_crm",
  } = {},
) {
  if (!Array.isArray(legacyUsers)) {
    throw new TypeError("legacyUsers must be an array.");
  }

  if (legacyUsers.length === 0) {
    throw new Error("legacyUsers array cannot be empty.");
  }

  console.log(
    `[Legacy Migration] Received ${legacyUsers.length} users through API.`,
  );

  const report = await runFullLegacyMigration(legacyUsers, {
    batchSize,
    strictCatalogMapping,
    sourceSystem,
  });

  return report;
}

/**
 * اجرای Migration در Background
 */
async function runMigrationInBackground(legacyUsers, options) {
  migrationState.status = "running";

  try {
    console.log("[Legacy Migration] Migration started.", {
      totalUsers: legacyUsers.length,
      options,
    });

    const report = await executeLegacyUsersMigration(legacyUsers, options);

    migrationState.status = "completed";
    migrationState.report = report;

    console.log("[Legacy Migration] Migration completed successfully.", {
      totalUsers: legacyUsers.length,

      processedUsers: report?.processedUsers,

      importedChallenges: report?.importedChallenges,

      importedAccounts: report?.importedAccounts,

      mappingErrors: report?.mappingErrors?.length || 0,

      missingReferrals: report?.missingReferrals?.length || 0,
    });
  } catch (error) {
    migrationState.status = "failed";
    migrationState.error = serializeError(error);

    console.error("[Legacy Migration] Migration failed.", {
      name: error.name,
      message: error.message,
      details: error.details || null,
      stack: error.stack,
    });
  } finally {
    migrationState.isRunning = false;

    migrationState.finishedAt = new Date().toISOString();
  }
}

/**
 * POST /api/internal/migrations/legacy-users/run
 *
 * Body:
 * {
 *   "users": [...],
 *   "options": {
 *     "batchSize": 500,
 *     "strictCatalogMapping": true,
 *     "sourceSystem": "legacy_crm"
 *   }
 * }
 */
async function startLegacyUsersMigration(req, res) {
  try {
    if (migrationState.isRunning) {
      return res.status(409).json({
        success: false,

        message: "Legacy users migration is already running.",

        migration: {
          status: migrationState.status,

          totalUsers: migrationState.totalUsers,

          startedAt: migrationState.startedAt,
        },
      });
    }

    const legacyUsers = req.body?.users;
    const requestOptions = req.body?.options || {};

    /**
     * اعتبارسنجی داده اصلی
     */
    if (!Array.isArray(legacyUsers)) {
      return res.status(422).json({
        success: false,

        message: 'Request body must contain a "users" array.',

        example: {
          users: [],
          options: {
            batchSize: 500,
            strictCatalogMapping: true,
            sourceSystem: "legacy_crm",
          },
        },
      });
    }

    if (legacyUsers.length === 0) {
      return res.status(422).json({
        success: false,
        message: "The users array cannot be empty.",
      });
    }

    /**
     * توجه:
     * استفاده از || برای boolean مناسب نیست؛
     * چون false را نادیده می‌گیرد.
     */
    const rawBatchSize = requestOptions.batchSize ?? 500;

    const batchSize = Number(rawBatchSize);

    const strictCatalogMapping = requestOptions.strictCatalogMapping !== false;

    const sourceSystem = String(
      requestOptions.sourceSystem || "legacy_crm",
    ).trim();

    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2000) {
      return res.status(422).json({
        success: false,

        message: "options.batchSize must be an integer between 1 and 2000.",
      });
    }

    if (!sourceSystem) {
      return res.status(422).json({
        success: false,

        message: "options.sourceSystem cannot be empty.",
      });
    }

    const options = {
      batchSize,
      strictCatalogMapping,
      sourceSystem,
    };

    /**
     * قبل از ارسال پاسخ، Migration را رزرو می‌کنیم
     * تا درخواست هم‌زمان دوم پذیرفته نشود.
     */
    reserveMigration({
      totalUsers: legacyUsers.length,
      options,
    });

    /**
     * بعد از آزاد شدن Event Loop،
     * عملیات Migration اجرا می‌شود.
     *
     * legacyUsers از req.body گرفته شده و به‌صورت مستقیم
     * به تابع Migration پاس داده می‌شود.
     */
    setImmediate(() => {
      runMigrationInBackground(legacyUsers, options).catch((error) => {
        /*
         * خطاهای معمول داخل خود تابع مدیریت می‌شوند.
         * این catch فقط یک لایه محافظتی نهایی است.
         */
        migrationState.isRunning = false;
        migrationState.status = "failed";

        migrationState.finishedAt = new Date().toISOString();

        migrationState.error = serializeError(error);

        console.error("[Legacy Migration] Unexpected background error:", error);
      });
    });

    return res.status(202).json({
      success: true,

      message:
        "Legacy users migration was accepted and will run in the background.",

      migration: {
        status: "accepted",
        totalUsers: legacyUsers.length,
        startedAt: migrationState.startedAt,
        options,
      },
    });
  } catch (error) {
    /**
     * اگر Migration قبل از setImmediate رزرو شده باشد
     * ولی اجرای Controller خطا بخورد، قفل را آزاد می‌کنیم.
     */
    migrationState.isRunning = false;
    migrationState.status = "failed";

    migrationState.finishedAt = new Date().toISOString();

    migrationState.error = serializeError(error);

    console.error("[Legacy Migration] Could not start migration:", error);

    return res.status(500).json({
      success: false,

      message: "Could not start legacy users migration.",

      error:
        process.env.NODE_ENV === "development"
          ? serializeError(error)
          : undefined,
    });
  }
}

/**
 * GET /api/internal/migrations/legacy-users/status
 */
function getLegacyUsersMigrationStatus(req, res) {
  return res.status(200).json({
    success: true,

    migration: {
      isRunning: migrationState.isRunning,

      status: migrationState.status,

      totalUsers: migrationState.totalUsers,

      options: migrationState.options,

      startedAt: migrationState.startedAt,

      finishedAt: migrationState.finishedAt,

      error: migrationState.error,

      report: migrationState.report,
    },
  });
}

module.exports = {
  startLegacyUsersMigration,
  getLegacyUsersMigrationStatus,
  executeLegacyUsersMigration,
};
