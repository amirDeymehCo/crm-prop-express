const { Op } = require("sequelize");

const ChallengeRecovery = require("../../models/ChallengeRecovery");
const User = require("../../models/User");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");
const SmsMessage = require("../../models/SmsMessage");
const { sendCustomMessage } = require("../KavenegarService");

const { RECOVERY_STATUS } = require("./constants");
const { round2 } = require("./helpers");

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/**
 * مراحل یادآور، از دور به نزدیک.
 *
 * ترتیب مهم است: کد از آخر به اول چک می‌کند تا همیشه نزدیک‌ترین مرحله برنده
 * شود. اگر فاکتوری از اول با مهلت کوتاه ساخته شود (مثلاً ۲۰ دقیقه)، مرحله‌ی
 * ۵ ساعته بی‌معنی است؛ در آن حالت فقط پیامک ۳۰ دقیقه می‌رود و مرحله‌ی دورتر
 * «رد شده» علامت می‌خورد تا بعداً پیام نامربوط نفرستیم.
 */
const REMINDER_STAGES = [
  { key: "5h", column: "reminder_5h_sent_at", withinMs: 5 * HOUR },
  { key: "30m", column: "reminder_30m_sent_at", withinMs: 30 * MINUTE },
];

const WIDEST_WINDOW_MS = Math.max(...REMINDER_STAGES.map((s) => s.withinMs));

/** لینکی که کاربر باید برود — لیست چالش‌ها، جایی که دکمه‌ی بازیابی هست */
function recoveryUrl() {
  const base = process.env.FRONT_BASE_URL || "https://myprop.trade";

  return `${base}/account/challenges`;
}

/**
 * مبلغی که کاربر همین حالا باید بپردازد.
 *
 * در فاکتور قسطی، چیزی که الان پرداخت می‌شود قسط اول است نه کل مبلغ؛ نوشتن
 * کل مبلغ در پیامک کاربر را می‌ترساند و نرخ تبدیل را پایین می‌آورد.
 */
function payableNow(recovery) {
  const isInstallment = recovery.payment_plan === "installment";

  const amount = isInstallment
    ? round2(recovery.first_amount_usd)
    : round2(recovery.offer_price_usd);

  return { amount, isInstallment };
}

function firstName(user) {
  const name = String(user?.firstname || "").trim();

  return name || "دوست من";
}

/**
 * متن یادآور ۵ ساعت مانده.
 *
 * لحن: اول همدلی با چیزی که از دست داده، بعد راه برگشت، آخر مهلت.
 *
 * «کمتر از ۵ ساعت» نوشته شده نه «۵ ساعت»، چون کرون هر ۵ دقیقه اجرا می‌شود و
 * لحظه‌ی ارسال دقیقاً سر ۵ ساعت نیست. اگر فاکتور از اول مهلت کوتاه‌تری داشته
 * باشد هم این جمله باز درست می‌ماند.
 *
 * ⚠️ طول متن = هزینه. فارسی هر ۷۰ کاراکتر یک پیامک حساب می‌شود و خودِ لینک
 * ۳۹ کاراکتر است. قبل از بلندتر کردن متن، هزینه‌اش را حساب کنید.
 */
function build5hMessage({ user, recovery, planTitle }) {
  const { amount, isInstallment } = payableNow(recovery);

  const priceLine = isInstallment
    ? `قسط اول ${amount} دلار`
    : `${amount} دلار`;

  return [
    `${firstName(user)} عزیز، می‌دونیم از دست دادن حساب ${planTitle} سخت بود.`,
    `با ${priceLine} همون حساب از همون مرحله برمی‌گرده. کمتر از ۵ ساعت فرصت داری:`,
    recoveryUrl(),
  ].join("\n");
}

/**
 * متن یادآور ۳۰ دقیقه مانده.
 *
 * اینجا دیگر توضیح نمی‌دهیم؛ فقط ضرب‌الاجل و هزینه‌ی از دست دادنش.
 * «قیمت کامل» مهم‌ترین اهرم است: کاربر باید بفهمد چیزی که از دست می‌دهد
 * تخفیف است، نه یک دکمه.
 */
function build30mMessage({ user, recovery, planTitle }) {
  const { amount, isInstallment } = payableNow(recovery);

  const priceLine = isInstallment
    ? `قسط اول ${amount} دلار`
    : `${amount} دلار`;

  return [
    `${firstName(user)} عزیز، کمتر از ۳۰ دقیقه تا پایان فرصت بازیابی حساب ${planTitle}.`,
    `با ${priceLine} برمی‌گرده؛ بعدش فقط چالش جدید با قیمت کامل:`,
    recoveryUrl(),
  ].join("\n");
}

const BUILDERS = {
  "5h": build5hMessage,
  "30m": build30mMessage,
};

/**
 * نزدیک‌ترین مرحله‌ای که برای این فاکتور باید ارسال شود.
 *
 * @returns {{stage: object, skipped: object[]}|null}
 */
function pickStage(recovery, remainingMs) {
  // از نزدیک‌ترین مرحله شروع کن
  for (let i = REMINDER_STAGES.length - 1; i >= 0; i -= 1) {
    const stage = REMINDER_STAGES[i];

    if (remainingMs > stage.withinMs) continue;
    if (recovery[stage.column]) continue;

    // مراحل دورتری که هنوز ارسال نشده‌اند دیگر بی‌معنی‌اند
    const skipped = REMINDER_STAGES.slice(0, i).filter(
      (s) => !recovery[s.column],
    );

    return { stage, skipped };
  }

  return null;
}

/**
 * یک مرحله را «رزرو» می‌کند.
 *
 * آپدیت شرطی است (فقط وقتی ستون هنوز null باشد) تا اگر دو نسخه از کرون
 * همزمان اجرا شوند، پیامک دو بار نرود. فقط اگر این آپدیت واقعاً ردیفی را
 * عوض کرد اجازه‌ی ارسال داریم.
 */
async function claimStage(recovery, column) {
  const [affected] = await ChallengeRecovery.update(
    { [column]: new Date() },
    { where: { id: recovery.id, [column]: null } },
  );

  return affected === 1;
}

async function releaseStage(recovery, column) {
  await ChallengeRecovery.update(
    { [column]: null },
    { where: { id: recovery.id } },
  );
}

/**
 * یادآورهای پیامکیِ نزدیک به پایان مهلت بازیابی.
 *
 * فقط فاکتورهای `pending_payment` که مهلت دارند و مهلتشان نگذشته هدف‌اند.
 * فاکتور `partially_paid` عمداً کنار گذاشته شده: کاربر قسط اول را داده و
 * حسابش احیا شده، مهلت دیگر برایش معنی ندارد.
 *
 * @param {object} [opts]
 * @param {Date}   [opts.now]     برای تست
 * @param {number} [opts.limit]
 * @param {boolean} [opts.dryRun] پیامک نفرست، فقط بگو چه می‌فرستادی
 */
async function sendExpiryReminders({ now = new Date(), limit = 200, dryRun = false } = {}) {
  const nowMs = now.getTime();

  const candidates = await ChallengeRecovery.findAll({
    where: {
      status: RECOVERY_STATUS.PENDING_PAYMENT,
      expires_at: {
        [Op.ne]: null,
        [Op.gt]: now,
        [Op.lte]: new Date(nowMs + WIDEST_WINDOW_MS),
      },
    },
    order: [["expires_at", "ASC"]],
    limit,
    include: [
      {
        model: User,
        attributes: ["id", "firstname", "lastname", "mobile"],
      },
      {
        model: UserChallenge,
        attributes: ["id", "challenge_plan_id"],
        include: [{ model: ChallengePlan, attributes: ["id", "title"] }],
      },
    ],
  });

  const results = { scanned: candidates.length, sent: 0, skipped: 0, failed: 0, details: [] };

  for (const recovery of candidates) {
    const remainingMs = new Date(recovery.expires_at).getTime() - nowMs;
    const picked = pickStage(recovery, remainingMs);

    if (!picked) continue;

    const { stage, skipped } = picked;
    const user = recovery.User;
    const mobile = String(user?.mobile || "").trim();

    // مراحل دورتر را همین‌جا می‌بندیم تا پیام نامربوط نرود
    for (const s of skipped) {
      await claimStage(recovery, s.column);
      results.skipped += 1;
      results.details.push({ recovery_id: recovery.id, stage: s.key, action: "skipped_too_late" });
    }

    if (!mobile) {
      await claimStage(recovery, stage.column);
      results.skipped += 1;
      results.details.push({ recovery_id: recovery.id, stage: stage.key, action: "no_mobile" });
      continue;
    }

    const planTitle = recovery.UserChallenge?.ChallengePlan?.title || "چالش";
    const message = BUILDERS[stage.key]({ user, recovery, planTitle });

    if (dryRun) {
      results.details.push({
        recovery_id: recovery.id,
        stage: stage.key,
        action: "dry_run",
        mobile,
        remaining_minutes: Math.round(remainingMs / MINUTE),
        message,
      });
      continue;
    }

    // اول رزرو، بعد ارسال — اگر ارسال بخورد زمین، رزرو را آزاد می‌کنیم تا
    // اجرای بعدیِ کرون دوباره تلاش کند.
    const claimed = await claimStage(recovery, stage.column);

    if (!claimed) continue;

    try {
      await sendCustomMessage({ receptor: mobile, message });

      await SmsMessage.create({
        text: message,
        user_id: user.id,
        target: "recovery_reminder",
      });

      results.sent += 1;
      results.details.push({
        recovery_id: recovery.id,
        stage: stage.key,
        action: "sent",
        remaining_minutes: Math.round(remainingMs / MINUTE),
      });
    } catch (err) {
      await releaseStage(recovery, stage.column);

      results.failed += 1;
      results.details.push({
        recovery_id: recovery.id,
        stage: stage.key,
        action: "failed",
        error: err?.message || "unknown",
      });

      console.error(
        `[recovery] reminder sms failed recovery_id=${recovery.id} stage=${stage.key}:`,
        err?.message,
      );
    }
  }

  return results;
}

module.exports = {
  REMINDER_STAGES,
  sendExpiryReminders,
  build5hMessage,
  build30mMessage,
  pickStage,
  payableNow,
  recoveryUrl,
};
