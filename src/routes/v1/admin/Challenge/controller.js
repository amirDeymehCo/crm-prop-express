const Controllers = require("../../../controllers");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../../../models/Challenge/ChallengePhase");
const AccountInstance = require("../../../../models/Challenge/AccountInstance");
const HistoryChallenge = require("../../../../models/Challenge/HistoryChallenge");
const sequelize = require("../../../../../db");
const CreateMTUser = require("../../../../services/BuyCh/CreateMTUser");

// اگر پسوردها رو جایی داری
const generateMainPassword = require("../../../../services/BuyCh/CreatePassword"); // مسیرش رو درست کن

const typesStatus = {
  payment_phase2: "در انتظار پرداخت چالش رایگان",
  closed: "بسته شده",
  phase1: "مرحله اول",
  phase2: "مرحله دوم",
  real: "مرحله ریل "
}

function getPhaseRulesFromSnapshot(userChallenge, phaseIndex) {
  const snap = userChallenge.rules_snapshot;
  if (!snap || !Array.isArray(snap.phases)) return null;
  return snap.phases.find(p => Number(p.phase_index) === Number(phaseIndex)) || null;
}

async function getOrCreateAccountInstance({ userChallenge, phaseIndex, cycleNo, t, platform = "mt5", adminId }) {
  // idempotent
  let acc = await AccountInstance.findOne({
    where: { user_challenge_id: userChallenge.id, phase_index: phaseIndex, cycle_no: cycleNo },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (acc) return acc;

  // بالانس شروع را از پلن یا اسنپ‌شات/قانون خودت تعیین کن
  // (فعلاً از plan account_size_usd استفاده می‌کنیم)
  const startingBalance = Number(userChallenge.ChallengePlan.account_size_usd);

  acc = await AccountInstance.create(
    {
      user_id: userChallenge.user_id,
      user_challenge_id: userChallenge.id,
      phase_index: phaseIndex,
      cycle_no: cycleNo,
      platform,
      starting_balance_usd: startingBalance,
      display_balance_usd: startingBalance,
      status: "pending",
      created_by_admin_id: adminId,
      rules_snapshot: userChallenge.rules_snapshot || null,
    },
    { transaction: t }
  );

  return acc;
}

async function provisionMTAndAttach({ acc, userChallenge, mtGroup, orderKey, t }) {
  // اگر قبلاً ساخته شده، دوباره نساز

  if (acc.mt_login) return acc;

  const plan = userChallenge.ChallengePlan;

  const inPassword = generateMainPassword();
  const mPassword = generateMainPassword();

  const mt = await CreateMTUser({
    order_id: orderKey,
    balance: Number(acc.starting_balance_usd),
    emailuser: 0,

    // قوانین (مثال: همونی که تو callback نوشتی)
    eod_role: Number(plan.max_daily_drawdown_percent),
    start_balance_role: Number(plan.max_overall_drawdown_percent),

    // ریسک شناور از روی پلن
    eod_relative: plan.has_floating_risk ? Number(plan.floating_risk_value || 0) : 0,

    inPassword,
    mPassword,
    leverge: plan.leverage,
    groupch: mtGroup,
  });

  if (!mt?.Login) {
    const err = new Error("ساخت حساب متاتریدر ناموفق بود");
    err.status = 500;
    throw err;
  }

  await acc.update(
    {
      mt_login: String(mt.Login),
      mt_server: mtGroup,
      mt_group: mtGroup,
      status: "active",
      activated_at: new Date(),
      mt_password: mPassword,
      in_password: inPassword,
    },
    { transaction: t }
  );

  return acc;
}

const Controller = class extends Controllers {
  async changeStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { user_challenge_id, status } = req.body;

      // 1) Lock UserChallenge + Plan
      const userCh = await UserChallenge.findByPk(user_challenge_id, {
        include: [{ model: ChallengePlan, attributes: ["id", "leverage", "account_size_usd", "has_floating_risk", "max_overall_drawdown_percent", "max_daily_drawdown_percent"] }, { model: ChallengePhase, attributes: ["id", "group", "phase_index"] }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!userCh) {
        await t.rollback();
        return this.response({ res, status: 400, message: "چالشی با این شناسه پیدا نشد" });
      }

      if (String(userCh.status) === String(status)) {
        await t.rollback();
        return this.response({ res, status: 400, message: "وضعیت ارسالی با وضعیت فعلی چالش یکی هست" });
      }

      // 2) انتخاب تنظیمات هر وضعیت
      // نکته: اسم status ها را با سیستم خودت یکی کن
      // مثال:
      let phaseIndex = null;

      switch (status) {
        case "payment_phase2":
        case "closed": {
          await userCh.update(
            { status },
            { transaction: t }
          );

          await HistoryChallenge.create({ type: "change_status", user_challenge_id: req?.body?.user_challenge_id, admin_id: req?.admin?.id, title: `وضعیت چالش ${typesStatus[status]} تغییر پیدا کرد` }, { transaction: t })

          await t.commit();

          return this.response({
            res,
            status: 200,
            message: "وضعیت چالش با موفقیت تغییر کرد",
          });
        }
        case "phase1":
          phaseIndex = 1;
          break;

        case "phase2":
          phaseIndex = 2;
          break;

        case "real":
          phaseIndex = 3;
          break;

        default:
          await t.rollback();
          return this.response({ res, status: 400, message: "وضعیت ارسالی معتبر نیست" });
      }

      const findGroup = await ChallengePhase.findOne({ where: { challenge_plan_id: userCh?.challenge_plan_id, phase_index: phaseIndex }, attributes: ["id", "group"] })

      // 3) آپدیت وضعیت کلی چالش
      await userCh.update(
        { status, current_phase_index: phaseIndex, challenge_phase: findGroup?.id },
        { transaction: t }
      );
      await HistoryChallenge.create({ type: "change_status", user_challenge_id: req?.body?.user_challenge_id, admin_id: req?.admin?.id, title: `وضعیت چالش ${typesStatus[status]} تغییر پیدا کرد` }, { transaction: t })

      // 4) ساخت/پیدا کردن AccountInstance برای این فاز
      // cycle_no: برای real بعد از payout احتمالاً cycle_no زیاد می‌شود.
      // فعلاً 1 می‌گذاریم. (بعداً برای payout می‌کنی 2,3,...)
      const acc = await getOrCreateAccountInstance({
        userChallenge: userCh,
        phaseIndex,
        cycleNo: 1,
        t,
        platform: "mt5",
        adminId: req?.admin?.id
      });

      // 5) اگر rules خاص فاز لازم داری از snapshot بخون (مثلاً تارگت سود)
      const phaseRules = getPhaseRulesFromSnapshot(userCh, phaseIndex);
      // اگر خواستی اینجا می‌تونی بر اساس phaseRules تصمیم بگیری (مثلاً گروه یا محدودیت‌ها)

      // 6) ساخت MT و ذخیره روی acc
      const orderKey = `ADMIN-${userCh.id}-${phaseIndex}-${Date.now()}`;
      await provisionMTAndAttach({
        acc,
        userChallenge: userCh,
        mtGroup: findGroup?.group,
        orderKey,
        t,
      });

      await t.commit();

      return this.response({
        res,
        status: 200,
        message: "وضعیت چالش با موفقیت تغییر کرد و اکانت ساخته/بررسی شد",
        data: {
          user_challenge_id: userCh.id,
          status: userCh.status,
          current_phase_index: userCh.current_phase_index,
          account_instance_id: acc.id,
          phase_index: acc.phase_index,
          mt_login: acc.mt_login,
          mt_server: acc.mt_server,
        },
      });
    } catch (err) {
      await t.rollback();
      return this.response({ res, status: err.status || 500, message: err.message || "خطای سرور" });
    }
  }
};

module.exports = new Controller();
