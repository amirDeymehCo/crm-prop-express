const axios = require("axios");
const { Op } = require("sequelize");

const sequelize = require("../../../db");
const AccountInstance = require("../../models/Challenge/AccountInstance");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const HistoryChallenge = require("../../models/Challenge/HistoryChallenge");

/**
 * همگام‌سازی وضعیت حساب‌های cTrader.
 *
 * سمت PHP نمی‌تواند هنگام بسته شدن حساب به ما خبر بدهد، پس ما خودمان
 * حساب‌های فعال cTrader را دسته‌دسته (پیش‌فرض ۴۰تایی) می‌گیریم و برای هر
 * لاگین از API «ctrader-login-rights» وضعیتش را می‌پرسیم.
 *
 * دو حالت دارد:
 *   - dryRun (پیش‌فرض): هیچ چیزی در دیتابیس عوض نمی‌شود، فقط گزارش می‌دهد.
 *   - apply: حساب‌های بسته‌شده را failed و چالششان را closed می‌کند.
 */

const RIGHTS_URL =
  process.env.CTRADER_RIGHTS_URL ||
  `${process.env.META_ANALYSIS_BASE_URL}/ctrader-login-rights-api.php`;
const CTRADER_API_KEY =
  process.env.CTRADER_API_KEY || "Mylafjdto#@hreogfh436t3458Prop";

// cTrader AccessRights: 0=FULL_ACCESS 1=CLOSE_ONLY 2=NO_TRADING 3=NO_LOGIN
const FULL_ACCESS = 0;

const OPEN_CHALLENGE_STATUSES = ["phase1", "phase2", "real"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchLoginRights(login) {
  const response = await axios.request({
    method: "GET",
    url: RIGHTS_URL,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": CTRADER_API_KEY,
    },
    // PHP بدنه‌ی JSON را حتی روی GET می‌خواند
    data: { login: Number(login) },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300 || !response.data?.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(response.data)?.slice(0, 300)}`,
    );
  }

  return response.data;
}

/**
 * حساب بسته شده؟ حذف شده یا دیگر دسترسی کامل معامله ندارد.
 */
function isClosedOnPlatform(rights) {
  if (rights.deleted) return true;
  if (Number(rights.access_rights) !== FULL_ACCESS) return true;
  return rights.can_trade === false;
}

/**
 * سمت cTrader حسابی که فاز را پاس کرده هم ممکن است Close Only شود. برای
 * اینکه چالش قبول‌شده را اشتباهی نبندیم، فقط وقتی بالانس زیر بالانس شروع
 * است آن را «شکست» حساب می‌کنیم؛ بقیه برای بررسی دستی گزارش می‌شوند.
 */
function looksFailed(account, rights) {
  const start = Number(account.starting_balance_usd);
  const balance = Number(rights.balance);
  if (!Number.isFinite(start) || !Number.isFinite(balance)) return false;
  return rights.deleted || balance < start;
}

async function closeAccount({ account, rights }) {
  const t = await sequelize.transaction();

  try {
    const acc = await AccountInstance.findByPk(account.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    // در فاصله‌ی استعلام کس دیگری (ادمین) تغییرش داده
    if (!acc || acc.status !== "active") {
      await t.rollback();
      return { closedChallenge: false, skipped: true };
    }

    const now = new Date();

    await acc.update(
      {
        status: "failed",
        closed_at: now,
        display_balance_usd: rights.balance ?? acc.display_balance_usd,
      },
      { transaction: t },
    );

    const userCh = await UserChallenge.findByPk(acc.user_challenge_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    // چالش را فقط وقتی می‌بندیم که این حساب، حسابِ فاز فعلی‌اش باشد؛
    // حساب فاز قبلی که فراموش شده active بماند نباید چالش فاز بعد را ببندد.
    let closedChallenge = false;
    if (
      userCh &&
      OPEN_CHALLENGE_STATUSES.includes(userCh.status) &&
      Number(userCh.current_phase_index) === Number(acc.phase_index)
    ) {
      await userCh.update(
        { status: "closed", ended_at: now },
        { transaction: t },
      );
      closedChallenge = true;
    }

    if (userCh) {
      await HistoryChallenge.create(
        {
          type: "change_status",
          user_challenge_id: userCh.id,
          admin_id: null,
          title: `حساب cTrader ${account.login} سمت پلتفرم بسته شده بود (${rights.access_rights_label || "deleted"}، بالانس ${rights.balance}) — ${closedChallenge ? "چالش به‌صورت خودکار بسته شد" : "فقط حساب failed شد"}`,
        },
        { transaction: t },
      );
    }

    await t.commit();
    return { closedChallenge, skipped: false };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * @param {object}   [opts]
 * @param {boolean}  [opts.dryRun=true]     فقط گزارش، بدون تغییر دیتابیس
 * @param {number}   [opts.batchSize=40]    تعداد حساب در هر دسته
 * @param {number}   [opts.concurrency=5]   درخواست هم‌زمان داخل هر دسته
 * @param {number}   [opts.pauseMs=2000]    مکث بین دسته‌ها
 * @param {number}   [opts.maxAccounts]     سقف کل حساب‌ها (برای تست)
 * @param {string[]} [opts.logins]          فقط همین لاگین‌ها (برای تست)
 * @param {Date}     [opts.deadline]        بعد از این زمان دسته‌ی جدید شروع نشود
 */
async function runCTraderStatusSync({
  dryRun = true,
  batchSize = 40,
  concurrency = 5,
  pauseMs = 2000,
  maxAccounts = Infinity,
  logins = null,
  deadline = null,
} = {}) {
  const stats = {
    dryRun,
    checked: 0,
    stillActive: 0,
    closedOnPlatform: 0,
    accountsFailed: 0,
    challengesClosed: 0,
    needsReview: 0,
    errors: 0,
    stoppedByDeadline: false,
    closed: [],
    review: [],
    failedLogins: [],
  };

  let lastId = 0;

  while (stats.checked < maxAccounts) {
    if (deadline && new Date() > deadline) {
      stats.stoppedByDeadline = true;
      break;
    }

    const where = {
      id: { [Op.gt]: lastId },
      platform: "ctrader",
      status: "active",
    };

    if (logins?.length) {
      where[Op.or] = [
        { mt_login: { [Op.in]: logins } },
        { platform_login: { [Op.in]: logins } },
      ];
    } else {
      where[Op.or] = [
        { mt_login: { [Op.ne]: null } },
        { platform_login: { [Op.ne]: null } },
      ];
    }

    const rows = await AccountInstance.findAll({
      where,
      attributes: [
        "id",
        "user_challenge_id",
        "phase_index",
        "mt_login",
        "platform_login",
        "starting_balance_usd",
      ],
      order: [["id", "ASC"]],
      limit: Math.min(batchSize, maxAccounts - stats.checked),
      raw: true,
    });

    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;

    const accounts = rows.map((r) => ({
      ...r,
      login: String(r.mt_login || r.platform_login).trim(),
    }));

    for (let i = 0; i < accounts.length; i += concurrency) {
      const chunk = accounts.slice(i, i + concurrency);

      await Promise.all(
        chunk.map(async (account) => {
          stats.checked++;

          let rights;
          try {
            rights = await fetchLoginRights(account.login);
          } catch (err) {
            stats.errors++;
            stats.failedLogins.push({ login: account.login, error: err.message });
            return;
          }

          if (!isClosedOnPlatform(rights)) {
            stats.stillActive++;
            return;
          }

          stats.closedOnPlatform++;

          const info = {
            account_id: account.id,
            user_challenge_id: account.user_challenge_id,
            login: account.login,
            access_rights_label: rights.access_rights_label,
            deleted: rights.deleted,
            balance: rights.balance,
            starting_balance: Number(account.starting_balance_usd),
          };

          if (!looksFailed(account, rights)) {
            stats.needsReview++;
            stats.review.push(info);
            return;
          }

          stats.closed.push(info);
          if (dryRun) return;

          try {
            const res = await closeAccount({ account, rights });
            if (!res.skipped) stats.accountsFailed++;
            if (res.closedChallenge) stats.challengesClosed++;
          } catch (err) {
            stats.errors++;
            stats.failedLogins.push({
              login: account.login,
              error: `db: ${err.message}`,
            });
          }
        }),
      );
    }

    if (rows.length < batchSize) break;
    await sleep(pauseMs);
  }

  return stats;
}

module.exports = {
  runCTraderStatusSync,
  fetchLoginRights,
  isClosedOnPlatform,
};
