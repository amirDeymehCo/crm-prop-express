const { Op } = require("sequelize");

const sequelize = require("../../../../../db");

const User = require("../../../../models/User");
const Wallet = require("../../../../models/Wallet");

const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../../../models/Challenge/ChallengePhase");

const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const AccountInstance = require("../../../../models/Challenge/AccountInstance");

/**
 * خطای مخصوص پیدا نشدن Type، Plan یا Phase
 */
class ChallengeCatalogMappingError extends Error {
  constructor(message, details = {}) {
    super(message);

    this.name = "ChallengeCatalogMappingError";
    this.details = details;
  }
}

/**
 * تبدیل کاراکترهای عربی به فارسی و حذف فاصله‌های اضافه
 */
function normalizePersianText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * تبدیل اعداد فارسی و عربی به انگلیسی
 *
 * Examples:
 * ۱۰۰۰       => 1000
 * ١٠٠٠       => 1000
 * 1,000      => 1000
 * 1000.00    => 1000
 */
function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalizedValue = String(value)
    .replace(/[۰-۹]/g, (digit) => {
      return String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit));
    })
    .replace(/[٠-٩]/g, (digit) => {
      return String("٠١٢٣٤٥٦٧٨٩".indexOf(digit));
    })
    .replace(/,/g, "")
    .trim();

  const numericValue = Number(normalizedValue);

  return Number.isFinite(numericValue) ? numericValue : null;
}

/**
 * تبدیل ID قدیمی به رشته استاندارد
 */
function normalizeLegacyId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value).trim();
}

/**
 * نرمال‌سازی ایمیل
 */
function normalizeEmail(value) {
  if (!value) {
    return null;
  }

  const email = String(value).trim().toLowerCase();

  return email || null;
}

/**
 * نرمال‌سازی موبایل
 *
 * این تابع فقط فاصله و خط تیره را حذف می‌کند.
 * اگر منطق دقیق‌تری برای 0098، +98 و 09 داری،
 * می‌توانی این قسمت را مطابق سیستم خودت تغییر بدهی.
 */
function normalizeMobile(value) {
  if (!value) {
    return null;
  }

  const mobile = String(value).trim().replace(/\s+/g, "").replace(/-/g, "");

  return mobile || null;
}

/**
 * ساخت Cache کاتالوگ چالش‌ها
 *
 * Type key:
 * fighter title
 *
 * Plan key:
 * typeId:accountSize
 *
 * Phase key:
 * planId:phaseIndex
 */
async function buildChallengeCatalogCache({ transaction = null } = {}) {
  const [types, plans, phases] = await Promise.all([
    ChallengeType.findAll({
      attributes: ["id", "title"],
      raw: true,
      transaction,
    }),

    ChallengePlan.findAll({
      attributes: ["id", "challenge_type_id", "account_size"],
      raw: true,
      transaction,
    }),

    ChallengePhase.findAll({
      attributes: ["id", "challenge_plan_id", "phase_index"],
      raw: true,
      transaction,
    }),
  ]);

  const typeByTitle = new Map();
  const planByTypeAndSize = new Map();
  const phaseByPlanAndIndex = new Map();

  /**
   * ساخت Map مربوط به Typeها
   *
   * Example:
   * "فایتر" => { id: 1, title: "فایتر" }
   */
  for (const type of types) {
    const normalizedTitle = normalizePersianText(type.title);

    if (!normalizedTitle) {
      continue;
    }

    if (typeByTitle.has(normalizedTitle)) {
      const previousType = typeByTitle.get(normalizedTitle);

      throw new Error(
        [
          "Duplicate ChallengeType detected after normalization.",
          `Normalized title: "${normalizedTitle}"`,
          `First type ID: ${previousType.id}`,
          `Second type ID: ${type.id}`,
        ].join(" "),
      );
    }

    typeByTitle.set(normalizedTitle, type);
  }

  /**
   * ساخت Map مربوط به Planها
   *
   * Example:
   * "1:1000" => Plan
   */
  for (const plan of plans) {
    const typeId = Number(plan.challenge_type_id);

    const accountSize = normalizeNumber(plan.account_size);

    if (!Number.isFinite(typeId) || accountSize === null) {
      continue;
    }

    const key = `${typeId}:${accountSize}`;

    if (planByTypeAndSize.has(key)) {
      const previousPlan = planByTypeAndSize.get(key);

      throw new Error(
        [
          "Duplicate ChallengePlan detected.",
          `Key: "${key}"`,
          `First plan ID: ${previousPlan.id}`,
          `Second plan ID: ${plan.id}`,
        ].join(" "),
      );
    }

    planByTypeAndSize.set(key, plan);
  }

  /**
   * ساخت Map مربوط به Phaseها
   *
   * Example:
   * "10:1" => Phase
   */
  for (const phase of phases) {
    const planId = Number(phase.challenge_plan_id);

    const phaseIndex = normalizeNumber(phase.phase_index);

    if (!Number.isFinite(planId) || phaseIndex === null) {
      continue;
    }

    const key = `${planId}:${phaseIndex}`;

    if (phaseByPlanAndIndex.has(key)) {
      const previousPhase = phaseByPlanAndIndex.get(key);

      throw new Error(
        [
          "Duplicate ChallengePhase detected.",
          `Key: "${key}"`,
          `First phase ID: ${previousPhase.id}`,
          `Second phase ID: ${phase.id}`,
        ].join(" "),
      );
    }

    phaseByPlanAndIndex.set(key, phase);
  }

  return {
    typeByTitle,
    planByTypeAndSize,
    phaseByPlanAndIndex,

    stats: {
      types: types.length,
      plans: plans.length,
      phases: phases.length,
    },
  };
}

/**
 * پیدا کردن Type، Plan و Phase واقعی در دیتابیس جدید
 *
 * Input:
 * {
 *   challenge_type: "فایتر",
 *   account_size: 1000,
 *   current_phase_index: 1
 * }
 */
function resolveChallengeCatalog(challenge, catalogCache) {
  const legacyChallengeId = normalizeLegacyId(challenge.legacy_challenge_id);

  const normalizedTypeTitle = normalizePersianText(challenge.challenge_type);

  const accountSize = normalizeNumber(challenge.account_size);

  const phaseIndex = normalizeNumber(challenge.current_phase_index);

  if (!legacyChallengeId) {
    throw new ChallengeCatalogMappingError("legacy_challenge_id is missing.", {
      challenge,
    });
  }

  if (!normalizedTypeTitle) {
    throw new ChallengeCatalogMappingError("Challenge type title is missing.", {
      legacyChallengeId,
      challengeType: challenge.challenge_type,
    });
  }

  if (accountSize === null) {
    throw new ChallengeCatalogMappingError(
      "Challenge account size is missing or invalid.",
      {
        legacyChallengeId,
        accountSize: challenge.account_size,
      },
    );
  }

  if (phaseIndex === null || phaseIndex < 1) {
    throw new ChallengeCatalogMappingError(
      "Challenge phase index is missing or invalid.",
      {
        legacyChallengeId,
        phaseIndex: challenge.current_phase_index,
      },
    );
  }

  /**
   * مرحله اول: پیدا کردن Type
   */
  const challengeType = catalogCache.typeByTitle.get(normalizedTypeTitle);

  if (!challengeType) {
    throw new ChallengeCatalogMappingError(
      `Challenge type not found: "${challenge.challenge_type}"`,
      {
        legacyChallengeId,
        challengeType: challenge.challenge_type,
        normalizedTypeTitle,
      },
    );
  }

  /**
   * مرحله دوم: پیدا کردن Plan
   */
  const planKey = `${challengeType.id}:${accountSize}`;

  const challengePlan = catalogCache.planByTypeAndSize.get(planKey);

  if (!challengePlan) {
    throw new ChallengeCatalogMappingError(
      [
        "Challenge plan not found.",
        `Type: "${challenge.challenge_type}"`,
        `Account size: ${accountSize}`,
      ].join(" "),
      {
        legacyChallengeId,
        challengeTypeId: challengeType.id,
        challengeType: challenge.challenge_type,
        accountSize,
        planKey,
      },
    );
  }

  /**
   * مرحله سوم: پیدا کردن Phase
   */
  const phaseKey = `${challengePlan.id}:${phaseIndex}`;

  const challengePhase = catalogCache.phaseByPlanAndIndex.get(phaseKey);

  if (!challengePhase) {
    throw new ChallengeCatalogMappingError(
      [
        "Challenge phase not found.",
        `Type: "${challenge.challenge_type}"`,
        `Account size: ${accountSize}`,
        `Phase: ${phaseIndex}`,
      ].join(" "),
      {
        legacyChallengeId,
        challengeTypeId: challengeType.id,
        challengePlanId: challengePlan.id,
        challengeType: challenge.challenge_type,
        accountSize,
        phaseIndex,
        phaseKey,
      },
    );
  }

  return {
    challengeType,
    challengePlan,
    challengePhase,

    challengeTypeId: challengeType.id,
    challengePlanId: challengePlan.id,
    challengePhaseId: challengePhase.id,

    accountSize,
    phaseIndex,
  };
}

/**
 * آماده‌سازی Payload چالش‌ها
 *
 * در حالت strict=true:
 * با وجود هر Mapping ناقص، عملیات متوقف می‌شود.
 *
 * در حالت strict=false:
 * چالش ناقص Skip می‌شود و خطا در گزارش قرار می‌گیرد.
 */
function prepareChallengesForMigration({
  legacyUsers,
  userMapping,
  sourceSystem,
  catalogCache,
  strictCatalogMapping = true,
}) {
  const challengePayloads = [];
  const challengeSourceData = new Map();
  const mappingErrors = [];

  for (const legacyUser of legacyUsers) {
    const legacyUserId = normalizeLegacyId(legacyUser.legacy_user_id);

    const dbUserId = userMapping.get(legacyUserId);

    if (!dbUserId) {
      const report = {
        type: "USER_NOT_MAPPED",
        legacyUserId,
        message: "User could not be resolved after import.",
      };

      mappingErrors.push(report);

      if (strictCatalogMapping) {
        throw new Error(JSON.stringify(report));
      }

      continue;
    }

    if (!Array.isArray(legacyUser.challenges)) {
      continue;
    }

    for (const challenge of legacyUser.challenges) {
      try {
        const resolved = resolveChallengeCatalog(challenge, catalogCache);

        const legacyChallengeId = normalizeLegacyId(
          challenge.legacy_challenge_id,
        );

        /**
         * فقط ستون‌های واقعی UserChallenge
         * وارد Payload می‌شوند.
         *
         * accounts را داخل bulkCreate نمی‌فرستیم.
         */
        challengePayloads.push({
          legacy_challenge_id: legacyChallengeId,

          source_system: sourceSystem,
          user_id: dbUserId,

          challenge_type_id: resolved.challengeTypeId,

          challenge_plan_id: resolved.challengePlanId,

          current_phase_id: resolved.challengePhaseId,

          current_phase_index: resolved.phaseIndex,

          platform: challenge.platform || "mt5",

          status: challenge.status || `phase_${resolved.phaseIndex}`,

          price_usd: challenge.price_usd ?? 0,

          discount_usd: challenge.discount_usd ?? 0,

          final_price_usd: challenge.final_price_usd ?? 0,

          started_at: challenge.started_at || null,

          rules_snapshot: challenge.rules_snapshot || {},
        });

        /**
         * اطلاعات اصلی Challenge برای ساخت Accountها
         */
        challengeSourceData.set(legacyChallengeId, {
          legacyUserId,
          dbUserId,
          challenge,
          resolved,
        });
      } catch (error) {
        if (!(error instanceof ChallengeCatalogMappingError)) {
          throw error;
        }

        const report = {
          type: "CATALOG_MAPPING_ERROR",

          legacyUserId,

          legacyChallengeId: normalizeLegacyId(challenge.legacy_challenge_id),

          challengeType: challenge.challenge_type,

          accountSize: challenge.account_size,

          phaseIndex: challenge.current_phase_index,

          message: error.message,
          details: error.details,
        };

        mappingErrors.push(report);

        if (strictCatalogMapping) {
          throw new ChallengeCatalogMappingError(error.message, report);
        }
      }
    }
  }

  return {
    challengePayloads,
    challengeSourceData,
    mappingErrors,
  };
}

/**
 * مهاجرت یک Batch از کاربران
 */
async function migrateUsersBatch(
  legacyUsers,
  {
    sourceSystem = "legacy_crm",
    catalogCache,
    strictCatalogMapping = true,
  } = {},
) {
  if (!Array.isArray(legacyUsers)) {
    throw new TypeError("legacyUsers must be an array.");
  }

  if (!catalogCache) {
    throw new Error("catalogCache is required.");
  }

  if (legacyUsers.length === 0) {
    return {
      success: true,
      processedUsersCount: 0,
      importedChallengesCount: 0,
      importedAccountsCount: 0,
      mappingErrors: [],
    };
  }

  const transaction = await sequelize.transaction();

  try {
    /*
     * ========================================
     * 1. Prepare and upsert Users
     * ========================================
     */

    const userPayloads = legacyUsers.map((legacyUser) => {
      const legacyUserId = normalizeLegacyId(legacyUser.legacy_user_id);

      if (!legacyUserId) {
        throw new Error("A user does not have legacy_user_id.");
      }

      return {
        legacy_user_id: legacyUserId,
        source_system: sourceSystem,

        firstname: legacyUser.firstname || null,

        lastname: legacyUser.lastname || null,

        email: normalizeEmail(legacyUser.email),

        mobile: normalizeMobile(legacyUser.mobile),

        verify_mobile: legacyUser.verify_mobile ?? false,

        /**
         * هش قدیمی مستقیماً ذخیره می‌شود.
         * hooks=false مانع Hash مجدد می‌شود.
         */
        password: legacyUser.password_hash || null,

        status: legacyUser.status || "approved",

        kyc_status: legacyUser.kyc_status || "not_sended",

        referral_code: legacyUser.referral_code || `MP-L${legacyUserId}`,
      };
    });

    await User.bulkCreate(userPayloads, {
      transaction,
      hooks: false,

      updateOnDuplicate: [
        "firstname",
        "lastname",
        "email",
        "mobile",
        "verify_mobile",
        "password",
        "status",
        "kyc_status",
      ],
    });

    /*
     * نکته مهم:
     * به IDهای برگشتی bulkCreate در MySQL
     * برای رکوردهای Update شده اعتماد نمی‌کنیم.
     *
     * کاربران را دوباره از دیتابیس می‌خوانیم.
     */

    const legacyUserIds = userPayloads.map((user) => user.legacy_user_id);

    const importedUsers = await User.findAll({
      where: {
        source_system: sourceSystem,

        legacy_user_id: {
          [Op.in]: legacyUserIds,
        },
      },

      attributes: ["id", "legacy_user_id"],

      raw: true,
      transaction,
    });

    const userMapping = new Map();

    for (const user of importedUsers) {
      userMapping.set(normalizeLegacyId(user.legacy_user_id), user.id);
    }

    const missingUsers = legacyUserIds.filter(
      (legacyUserId) => !userMapping.has(normalizeLegacyId(legacyUserId)),
    );

    if (missingUsers.length > 0) {
      throw new Error(
        `Some imported users could not be resolved: ${missingUsers.join(", ")}`,
      );
    }

    /*
     * ========================================
     * 2. Create missing Wallets
     * ========================================
     */

    const importedUserIds = Array.from(userMapping.values());

    const existingWallets =
      importedUserIds.length > 0
        ? await Wallet.findAll({
            where: {
              user_id: {
                [Op.in]: importedUserIds,
              },
            },

            attributes: ["user_id"],
            raw: true,
            transaction,
          })
        : [];

    const usersWithWallet = new Set(
      existingWallets.map((wallet) => String(wallet.user_id)),
    );

    const walletPayloads = importedUserIds
      .filter((userId) => !usersWithWallet.has(String(userId)))
      .map((userId) => ({
        user_id: userId,
        balance: 0,
        currency: "USD",
      }));

    if (walletPayloads.length > 0) {
      await Wallet.bulkCreate(walletPayloads, {
        transaction,
        hooks: false,
        ignoreDuplicates: true,
      });
    }

    /*
     * ========================================
     * 3. Resolve and prepare Challenges
     * ========================================
     */

    const { challengePayloads, challengeSourceData, mappingErrors } =
      prepareChallengesForMigration({
        legacyUsers,
        userMapping,
        sourceSystem,
        catalogCache,
        strictCatalogMapping,
      });

    /*
     * ========================================
     * 4. Upsert Challenges
     * ========================================
     */

    if (challengePayloads.length > 0) {
      await UserChallenge.bulkCreate(challengePayloads, {
        transaction,
        hooks: false,

        updateOnDuplicate: [
          "user_id",
          "challenge_type_id",
          "challenge_plan_id",
          "current_phase_id",
          "current_phase_index",
          "platform",
          "status",
          "price_usd",
          "discount_usd",
          "final_price_usd",
          "started_at",
          "rules_snapshot",
        ],
      });
    }

    /*
     * دوباره خواندن Challengeها از دیتابیس
     * برای ساخت Mapping مطمئن
     */

    const legacyChallengeIds = challengePayloads.map(
      (challenge) => challenge.legacy_challenge_id,
    );

    const importedChallenges =
      legacyChallengeIds.length > 0
        ? await UserChallenge.findAll({
            where: {
              source_system: sourceSystem,

              legacy_challenge_id: {
                [Op.in]: legacyChallengeIds,
              },
            },

            attributes: [
              "id",
              "legacy_challenge_id",
              "user_id",
              "challenge_plan_id",
              "current_phase_id",
            ],

            raw: true,
            transaction,
          })
        : [];

    const challengeMapping = new Map();

    for (const challenge of importedChallenges) {
      challengeMapping.set(
        normalizeLegacyId(challenge.legacy_challenge_id),
        challenge.id,
      );
    }

    const missingChallenges = legacyChallengeIds.filter(
      (legacyChallengeId) =>
        !challengeMapping.has(normalizeLegacyId(legacyChallengeId)),
    );

    if (missingChallenges.length > 0) {
      throw new Error(
        [
          "Some imported challenges could not be resolved:",
          missingChallenges.join(", "),
        ].join(" "),
      );
    }

    /*
     * ========================================
     * 5. Prepare Account Instances
     * ========================================
     */

    const accountPayloads = [];

    for (const [
      legacyChallengeId,
      sourceData,
    ] of challengeSourceData.entries()) {
      const dbChallengeId = challengeMapping.get(legacyChallengeId);

      if (!dbChallengeId) {
        if (strictCatalogMapping) {
          throw new Error(
            `Challenge mapping not found for legacy challenge ${legacyChallengeId}.`,
          );
        }

        continue;
      }

      const accounts = Array.isArray(sourceData.challenge.accounts)
        ? sourceData.challenge.accounts
        : [];

      for (const account of accounts) {
        const legacyAccountId = normalizeLegacyId(account.legacy_account_id);

        if (!legacyAccountId) {
          throw new Error(
            `Account does not have legacy_account_id. Legacy challenge: ${legacyChallengeId}`,
          );
        }

        const accountPhaseIndex =
          normalizeNumber(account.phase_index) ??
          sourceData.resolved.phaseIndex;

        const cycleNumber = normalizeNumber(account.cycle_no) ?? 1;

        accountPayloads.push({
          legacy_account_id: legacyAccountId,

          source_system: sourceSystem,

          user_id: sourceData.dbUserId,

          user_challenge_id: dbChallengeId,

          phase_index: accountPhaseIndex,

          cycle_no: cycleNumber,

          platform: account.platform || sourceData.challenge.platform || "mt5",

          platform_login: account.platform_login || null,

          platform_server: account.platform_server || null,

          starting_balance_usd:
            account.starting_balance_usd ?? sourceData.resolved.accountSize,

          status: account.status || "pending",

          activated_at: account.activated_at || null,

          closed_at: account.closed_at || null,
        });
      }
    }

    /*
     * ========================================
     * 6. Upsert Account Instances
     * ========================================
     */

    if (accountPayloads.length > 0) {
      await AccountInstance.bulkCreate(accountPayloads, {
        transaction,
        hooks: false,

        updateOnDuplicate: [
          "user_id",
          "user_challenge_id",
          "phase_index",
          "cycle_no",
          "platform",
          "platform_login",
          "platform_server",
          "starting_balance_usd",
          "status",
          "activated_at",
          "closed_at",
        ],
      });
    }

    /*
     * ========================================
     * 7. Commit Transaction
     * ========================================
     */

    await transaction.commit();

    return {
      success: true,

      processedUsersCount: legacyUsers.length,

      resolvedUsersCount: userMapping.size,

      createdWalletsCount: walletPayloads.length,

      importedChallengesCount: challengePayloads.length,

      importedAccountsCount: accountPayloads.length,

      mappingErrors,
    };
  } catch (error) {
    await transaction.rollback();

    console.error("Migration batch failed:", {
      name: error.name,
      message: error.message,
      details: error.details || null,
      stack: error.stack,
    });

    throw error;
  }
}

/**
 * بازسازی Referralها
 *
 * این تابع باید بعد از انتقال کامل تمام کاربران اجرا شود.
 */
async function rebuildReferralRelationsBatch(
  legacyUsers,
  { sourceSystem = "legacy_crm" } = {},
) {
  if (!Array.isArray(legacyUsers)) {
    throw new TypeError("legacyUsers must be an array.");
  }

  const transaction = await sequelize.transaction();

  try {
    const referralRelations = legacyUsers
      .map((legacyUser) => ({
        childLegacyId: normalizeLegacyId(legacyUser.legacy_user_id),

        referrerLegacyId: normalizeLegacyId(legacyUser.referrer_legacy_user_id),
      }))
      .filter(
        (relation) => relation.childLegacyId && relation.referrerLegacyId,
      );

    if (referralRelations.length === 0) {
      await transaction.commit();

      return {
        success: true,
        updatedReferralsCount: 0,
        missingReferrals: [],
      };
    }

    const allRequiredLegacyIds = [
      ...new Set(
        referralRelations.flatMap((relation) => [
          relation.childLegacyId,
          relation.referrerLegacyId,
        ]),
      ),
    ];

    const users = await User.findAll({
      where: {
        source_system: sourceSystem,

        legacy_user_id: {
          [Op.in]: allRequiredLegacyIds,
        },
      },

      attributes: ["id", "legacy_user_id"],

      raw: true,
      transaction,
    });

    const userMapping = new Map();

    for (const user of users) {
      userMapping.set(normalizeLegacyId(user.legacy_user_id), user.id);
    }

    const missingReferrals = [];
    let updatedReferralsCount = 0;

    for (const relation of referralRelations) {
      const childUserId = userMapping.get(relation.childLegacyId);

      const referrerUserId = userMapping.get(relation.referrerLegacyId);

      if (!childUserId || !referrerUserId) {
        missingReferrals.push({
          childLegacyId: relation.childLegacyId,

          referrerLegacyId: relation.referrerLegacyId,

          childFound: Boolean(childUserId),

          referrerFound: Boolean(referrerUserId),
        });

        continue;
      }

      if (String(childUserId) === String(referrerUserId)) {
        missingReferrals.push({
          childLegacyId: relation.childLegacyId,

          referrerLegacyId: relation.referrerLegacyId,

          reason: "SELF_REFERRAL",
        });

        continue;
      }

      const [affectedRows] = await User.update(
        {
          referrer_id: referrerUserId,
        },
        {
          where: {
            id: childUserId,
            source_system: sourceSystem,
          },

          hooks: false,
          transaction,
        },
      );

      updatedReferralsCount += affectedRows;
    }

    await transaction.commit();

    return {
      success: true,
      updatedReferralsCount,
      missingReferrals,
    };
  } catch (error) {
    await transaction.rollback();

    console.error("Referral reconstruction failed:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw error;
  }
}

/**
 * تقسیم آرایه به Batchهای کوچک
 */
function chunkArray(items, chunkSize = 500) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array.");
  }

  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new TypeError("chunkSize must be a positive integer.");
  }

  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

/**
 * اجرای کامل مهاجرت:
 *
 * 1. ساخت کاتالوگ
 * 2. انتقال کاربران
 * 3. انتقال چالش‌ها
 * 4. انتقال حساب‌ها
 * 5. بازسازی Referralها
 */
async function runFullLegacyMigration(
  allLegacyUsers,
  {
    sourceSystem = "legacy_crm",
    batchSize = 500,
    strictCatalogMapping = true,
  } = {},
) {
  if (!Array.isArray(allLegacyUsers)) {
    throw new TypeError("allLegacyUsers must be an array.");
  }

  console.log("Building challenge catalog cache...");

  const catalogCache = await buildChallengeCatalogCache();

  console.log("Challenge catalog loaded:", catalogCache.stats);

  const chunks = chunkArray(allLegacyUsers, batchSize);

  const migrationReport = {
    startedAt: new Date().toISOString(),

    sourceSystem,
    batchSize,

    totalUsers: allLegacyUsers.length,

    totalBatches: chunks.length,

    catalog: catalogCache.stats,

    processedUsers: 0,
    importedChallenges: 0,
    importedAccounts: 0,
    createdWallets: 0,

    mappingErrors: [],
    missingReferrals: [],

    batches: [],
  };

  /*
   * ========================================
   * Phase 1: Users, Wallets, Challenges,
   *          Account Instances
   * ========================================
   */

  for (let index = 0; index < chunks.length; index++) {
    const batchNumber = index + 1;
    const batch = chunks[index];

    console.log(
      [
        `Processing migration batch`,
        `${batchNumber}/${chunks.length}`,
        `(${batch.length} users)...`,
      ].join(" "),
    );

    const result = await migrateUsersBatch(batch, {
      sourceSystem,
      catalogCache,
      strictCatalogMapping,
    });

    migrationReport.processedUsers += result.processedUsersCount;

    migrationReport.importedChallenges += result.importedChallengesCount;

    migrationReport.importedAccounts += result.importedAccountsCount;

    migrationReport.createdWallets += result.createdWalletsCount;

    migrationReport.mappingErrors.push(...result.mappingErrors);

    migrationReport.batches.push({
      batchNumber,
      ...result,
    });

    console.log(`Batch ${batchNumber} completed.`, {
      users: result.processedUsersCount,

      challenges: result.importedChallengesCount,

      accounts: result.importedAccountsCount,

      mappingErrors: result.mappingErrors.length,
    });
  }

  /*
   * ========================================
   * Phase 2: Rebuild Referrals
   * ========================================
   */

  console.log("Rebuilding referral relations...");

  for (let index = 0; index < chunks.length; index++) {
    const batchNumber = index + 1;
    const batch = chunks[index];

    console.log(`Processing referral batch ${batchNumber}/${chunks.length}...`);

    const referralResult = await rebuildReferralRelationsBatch(batch, {
      sourceSystem,
    });

    migrationReport.missingReferrals.push(...referralResult.missingReferrals);
  }

  migrationReport.finishedAt = new Date().toISOString();

  console.log("Full migration completed.", {
    processedUsers: migrationReport.processedUsers,

    importedChallenges: migrationReport.importedChallenges,

    importedAccounts: migrationReport.importedAccounts,

    mappingErrors: migrationReport.mappingErrors.length,

    missingReferrals: migrationReport.missingReferrals.length,
  });

  return migrationReport;
}

module.exports = {
  ChallengeCatalogMappingError,

  normalizePersianText,
  normalizeNumber,
  normalizeLegacyId,
  normalizeEmail,
  normalizeMobile,

  buildChallengeCatalogCache,
  resolveChallengeCatalog,
  prepareChallengesForMigration,

  migrateUsersBatch,
  rebuildReferralRelationsBatch,
  runFullLegacyMigration,

  chunkArray,
};
