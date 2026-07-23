const sequelize = require("../../../../../db");
const User = require("../../../../models/User");
const Wallet = require("../../../../models/Wallet");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const AccountInstance = require("../../../../models/Challenge/AccountInstance");
const ChallengePhase = require("../../../../models/Challenge/ChallengePhase");
const Controllers = require("../../controllers");

const Controller = class extends Controllers {
  async migrateUsersBatch(legacyUsers, sourceSystem = "legacy_crm") {
    const transaction = await sequelize.transaction();

    try {
      // ۱. آماده‌سازی و ساخت/بروزرسانی کاربران
      const userPayloads = legacyUsers.map((u) => ({
        legacy_user_id: String(u.legacy_user_id),
        source_system: sourceSystem,
        firstname: u.firstname,
        lastname: u.lastname,
        email: u.email ? u.email.trim().toLowerCase() : null,
        mobile: u.mobile,
        verify_mobile: u.verify_mobile ?? false,
        password: "",
        status: u.status || "approved",
        kyc_status: u.kyc_status || "not_sended",
        referral_code: "MP-L" + u.legacy_user_id, // کد معرف یکتا بر اساس شناسه قدیمی
      }));

      // درج یا بروزرسانی کاربران (بر اساس کلید یکتای ترکیبی legacy_user_id و source_system)
      const importedUsers = await User.bulkCreate(userPayloads, {
        transaction,
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
        hooks: false, // غیرفعال کردن هوک رمزنگاری مجدد و ساخت تک‌تک والت‌ها
      });

      // نگاشت شناسه قدیمی کاربر به شناسه دیتابیس جدید
      const userMapping = {};
      importedUsers.forEach((user) => {
        userMapping[user.legacy_user_id] = user.id;
      });

      // ۲. ایجاد کیف پول برای کاربرانی که والت ندارند
      const existingWallets = await Wallet.findAll({
        where: { user_id: Object.values(userMapping) },
        attributes: ["user_id"],
        transaction,
      });
      const usersWithWallet = new Set(existingWallets.map((w) => w.user_id));

      const walletPayloads = Object.values(userMapping)
        .filter((userId) => !usersWithWallet.has(userId))
        .map((userId) => ({
          user_id: userId,
          balance: 0,
          currency: "USD",
        }));

      if (walletPayloads.length > 0) {
        await Wallet.bulkCreate(walletPayloads, { transaction, hooks: false });
      }

      // ۳. جمع‌آوری داده‌های چالش‌ها و حساب‌ها
      const challengesToInsert = [];
      const accountsDataTemp = []; // موقتا نگهداری می‌کنیم تا چالش‌ها آیدی بگیرند

      for (const u of legacyUsers) {
        const dbUserId = userMapping[u.legacy_user_id];
        if (!dbUserId || !u.challenges) continue;

        for (const ch of u.challenges) {
          // پیدا کردن فاز متناظر با چالش برای ثبت در current_phase_id
          const phase = await ChallengePhase.findOne({
            where: {
              challenge_plan_id: ch.challenge_plan_id,
              phase_index: ch.current_phase_index,
            },
            transaction,
          });

          challengesToInsert.push({
            legacy_challenge_id: String(ch.legacy_challenge_id),
            source_system: sourceSystem,
            user_id: dbUserId,
            challenge_type_id: ch.challenge_type_id,
            challenge_plan_id: ch.challenge_plan_id,
            current_phase_id: phase ? phase.id : null,
            current_phase_index: ch.current_phase_index || 1,
            platform: ch.platform || "mt5",
            status: ch.status || "phase_1",
            price_usd: ch.price_usd || 0,
            discount_usd: ch.discount_usd || 0,
            final_price_usd: ch.final_price_usd || 0,
            started_at: ch.started_at,
            rules_snapshot: ch.rules_snapshot || {},
            accounts: ch.accounts || [], // برای پردازش گام بعدی
          });
        }
      }

      // ثبت یا بروزرسانی چالش‌ها
      let importedChallenges = [];
      if (challengesToInsert.length > 0) {
        importedChallenges = await UserChallenge.bulkCreate(
          challengesToInsert,
          {
            transaction,
            updateOnDuplicate: [
              "current_phase_id",
              "current_phase_index",
              "status",
              "price_usd",
              "discount_usd",
              "final_price_usd",
              "started_at",
              "rules_snapshot",
            ],
          },
        );
      }

      // نگاشت شناسه قدیمی چالش به شناسه دیتابیس جدید
      const challengeMapping = {};
      importedChallenges.forEach((ch) => {
        challengeMapping[ch.legacy_challenge_id] = ch.id;
      });

      // ۴. ثبت یا بروزرسانی حساب‌های هر چالش (AccountInstances)
      const accountPayloads = [];
      for (const chInfo of challengesToInsert) {
        const dbChallengeId = challengeMapping[chInfo.legacy_challenge_id];
        if (!dbChallengeId) continue;

        for (const acc of chInfo.accounts) {
          accountPayloads.push({
            legacy_account_id: String(acc.legacy_account_id),
            source_system: sourceSystem,
            user_id: chInfo.user_id,
            user_challenge_id: dbChallengeId,
            phase_index: acc.phase_index,
            cycle_no: acc.cycle_no || 1,
            platform: acc.platform || "mt5",
            platform_login: acc.platform_login,
            platform_server: acc.platform_server,
            starting_balance_usd: acc.starting_balance_usd,
            status: acc.status || "pending",
            activated_at: acc.activated_at,
            closed_at: acc.closed_at,
          });
        }
      }

      if (accountPayloads.length > 0) {
        await AccountInstance.bulkCreate(accountPayloads, {
          transaction,
          updateOnDuplicate: [
            "status",
            "platform_login",
            "platform_server",
            "starting_balance_usd",
            "activated_at",
            "closed_at",
          ],
        });
      }

      // تایید نهایی تراکنش دیتابیس
      await transaction.commit();
      return {
        success: true,
        processedUsersCount: legacyUsers.length,
        importedChallengesCount: importedChallenges.length,
        importedAccountsCount: accountPayloads.length,
      };
    } catch (error) {
      // در صورت بروز هرگونه خطا، کل دیتای این بچ رول‌بک می‌شود تا انسجام حفظ شود
      await transaction.rollback();
      console.error("Migration Batch failed: ", error);
      throw error;
    }
  }

  /**
   * گام دوم (جداگانه اجرا شود): بازسازی ساختار رفرال‌ها پس از پایان ایمپورت کل کاربران
   */
  async rebuildReferralRelations(legacyUsers, sourceSystem = "legacy_crm") {
    const transaction = await sequelize.transaction();
    try {
      for (const u of legacyUsers) {
        if (u.referrer_legacy_user_id) {
          // یافتن کاربر معرف در سیستم جدید
          const referrer = await User.findOne({
            where: {
              legacy_user_id: String(u.referrer_legacy_user_id),
              source_system: sourceSystem,
            },
            attributes: ["id"],
            transaction,
          });

          if (referrer) {
            // بروزرسانی فیلد referrer_id برای کاربر زیرمجموعه
            await User.update(
              { referrer_id: referrer.id },
              {
                where: {
                  legacy_user_id: String(u.legacy_user_id),
                  source_system: sourceSystem,
                },
                transaction,
                hooks: false,
              },
            );
          }
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error("Rebuilding referrals failed: ", error);
      throw error;
    }
  }
};

module.exports = new Controller();
