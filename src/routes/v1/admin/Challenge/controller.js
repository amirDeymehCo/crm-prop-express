const Controllers = require("../../../controllers");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../../../models/Challenge/ChallengePhase");
const AccountInstance = require("../../../../models/Challenge/AccountInstance");
const HistoryChallenge = require("../../../../models/Challenge/HistoryChallenge");
const Order = require("../../../../models/Order");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const User = require("../../../../models/User");
const Admin = require("../../../../models/Admin");
const Certificates = require("../../../../models/Certificates");
const ChallengeRejectReason = require("../../../../models/ChallengeRejectReason");
const ChallengeRejection = require("../../../../models/ChallengeRejection");
const ChallengeRejectionItem = require("../../../../models/ChallengeRejectionItem");
const sequelize = require("../../../../../db");
// const CreateMTUser = require("../../../../services/BuyCh/CreateMTUser");
const founcList = require("../../../../utils/List");
const createChFounc = require("../../../../services/BuyCh/CreateCh");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const QRCode = require("qrcode");
const dayjs = require("dayjs");
const { v4: uuid } = require("uuid");
const {
  getCertificateHTMLPhase,
} = require("../../../../utils/certificateTemplatePhase");
const {
  fetchFullAccountAnalysis,
} = require("../../../..//services/AnalysisUser/accountAnalysisService");

// اگر پسوردها رو جایی داری
const generateMainPassword = require("../../../../services/BuyCh/CreatePassword"); // مسیرش رو درست کن
const { Op } = require("sequelize");
const createTradingAccount = require("../../../../services/BuyCh/CreateTrainingAccount");

const typesStatus = {
  payment_phase2: "در انتظار پرداخت چالش رایگان",
  closed: "بسته شده",
  phase1: "مرحله اول",
  phase2: "مرحله دوم",
  real: "مرحله ریل ",
  pending_payment: "در انتظار پرداخت",
};

function getPhaseRulesFromSnapshot(userChallenge, phaseIndex) {
  const snap = userChallenge.rules_snapshot;
  if (!snap || !Array.isArray(snap.phases)) return null;
  return (
    snap.phases.find((p) => Number(p.phase_index) === Number(phaseIndex)) ||
    null
  );
}

async function getOrCreateAccountInstance({
  userChallenge,
  phaseIndex,
  cycleNo,
  t,
  platform = "mt5",
  adminId,
}) {
  // idempotent
  let acc = await AccountInstance.findOne({
    where: {
      user_challenge_id: userChallenge.id,
      phase_index: phaseIndex,
      cycle_no: cycleNo,
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (acc) return acc;

  // بالانس شروع را از پلن یا اسنپ‌شات/قانون خودت تعیین کن
  // (فعلاً از plan balance استفاده می‌کنیم)
  const startingBalance = Number(userChallenge.ChallengePlan.balance);

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
    { transaction: t },
  );

  return acc;
}

async function provisionMTAndAttach({
  acc,
  userChallenge,
  mtGroup,
  orderKey,
  t,
  platform,
  findUser,
}) {
  // اگر قبلاً ساخته شده، دوباره نساز

  if (acc.mt_login) return acc;

  const plan = userChallenge.ChallengePlan;

  const inPassword = generateMainPassword();
  const mPassword = generateMainPassword();

  const result = await createTradingAccount({
    provider: platform,
    order_id: orderKey,
    balance: Number(acc.starting_balance_usd),
    emailuser: 0,
    eod_role: Number(plan.max_daily_drawdown_percent),
    start_balance_role: Number(plan.max_overall_drawdown_percent),
    eod_relative: plan.has_floating_risk
      ? Number(plan.floating_risk_value || 0)
      : 0,
    inPassword,
    mPassword,
    leverge: plan.leverage,
    groupch: mtGroup,

    // ctrader fileds
    email: findUser?.email,
    first_name: findUser?.firstname,
    last_name: findUser?.lastname,
  });
  if (!result?.Login && !result?.login) {
    const err = new Error("ساخت حساب ناموفق بود");
    err.status = 500;
    throw err;
  }

  await acc.update(
    {
      mt_login: String(result?.Login),
      mt_server: mtGroup,
      mt_group: mtGroup,
      email: result?.email || null,
      status: "active",
      activated_at: new Date(),
      mt_password: mPassword,
      in_password: inPassword,
    },
    { transaction: t },
  );

  return acc;
}

async function createPhaseCertificate({
  user,
  phase,
  total_profit,
  withdraw_profit = 0,
}) {
  const date = new Date();
  const certificateId = uuid();
  const formattedDate = dayjs(date).format("DD MMMM YYYY");

  const fileName = `phase-${phase}-${certificateId}.png`;

  const qrData = await QRCode.toDataURL(fileName);

  const html = getCertificateHTMLPhase({
    fullName: `${user.firstname} ${user.lastname}`,
    qrData,
    formattedDate,
    phase,
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  const page = await browser.newPage();

  await page.setViewport({
    width: 1123,
    height: 794,
    deviceScaleFactor: 2,
  });

  await page.setContent(html, { waitUntil: "load" });

  const outputDir = path.join(process.cwd(), "public/certificates");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, fileName);

  await page.screenshot({
    path: filePath,
    type: "png",
    fullPage: false,
  });

  await browser.close();

  return Certificates.create({
    type: `steep${phase}`,
    url_file: `certificates/${fileName}`,
    fullname: `${user.firstname} ${user.lastname}`,
    date,
    total_profit,
    withdraw_profit,
    user_id: user.id,
  });
}

function getCertificatePhase(prevPhase, newPhase) {
  // phase1 -> phase2  => cert phase 1
  if (prevPhase === 1 && newPhase === 2) return 1;

  // phase2 -> real => cert phase 2
  if (prevPhase === 2 && newPhase === 3) return 2;

  return null;
}

const Controller = class extends Controllers {
  async changeStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { user_challenge_id, status } = req.body;

      // 1) Lock UserChallenge + Plan
      const userCh = await UserChallenge.findByPk(user_challenge_id, {
        include: [
          {
            model: ChallengePlan,
            // اضافه شد
            attributes: [
              "id",
              "leverage",
              "balance",
              "has_floating_risk",
              "max_overall_drawdown_percent",
              "max_daily_drawdown_percent",
              "challenge_type_id",
            ],
          },
          { model: ChallengePhase, attributes: ["id", "group", "phase_index"] },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const user = await User.findByPk(userCh.user_id, {
        attributes: ["id", "firstname", "lastname", "email"],
        transaction: t,
      });

      if (!userCh) {
        await t.rollback();
        return this.response({
          res,
          status: 400,
          message: "چالشی با این شناسه پیدا نشد",
        });
      }

      // if (String(userCh.status) === String(status)) {
      //   await t.rollback();
      //   return this.response({
      //     res,
      //     status: 400,
      //     message: "وضعیت ارسالی با وضعیت فعلی چالش یکی هست",
      //   });
      // }

      // 2) انتخاب تنظیمات هر وضعیت
      // نکته: اسم status ها را با سیستم خودت یکی کن
      // مثال:
      let phaseIndex = null;
      const perPhaseIndex = userCh?.current_phase_index;

      switch (status) {
        case "payment_phase2":
        case "pending_payment": {
          await userCh.update({ status }, { transaction: t });

          await HistoryChallenge.create(
            {
              type: "change_status",
              user_challenge_id: req?.body?.user_challenge_id,
              admin_id: req?.admin?.id,
              title: `وضعیت چالش ${typesStatus[status]} تغییر پیدا کرد`,
            },
            { transaction: t },
          );

          await t.commit();
          return this.response({
            res,
            status: 200,
            message: "وضعیت چالش با موفقیت تغییر کرد",
          });
        }
        case "closed": {
          const { reason_ids = [], description = null } = req.body;

          if (!Array.isArray(reason_ids) || reason_ids.length === 0) {
            await t.rollback();
            return this.response({
              res,
              status: 400,
              message: "حداقل یک دلیل برای رد شدن انتخاب کنید",
            });
          }

          // بررسی اینکه reason ها معتبر باشند
          const validReasons = await ChallengeRejectReason.findAll({
            where: { id: reason_ids },
            attributes: ["id"],
            transaction: t,
          });

          if (validReasons.length !== reason_ids.length) {
            await t.rollback();
            return this.response({
              res,
              status: 400,
              message: "برخی از دلایل انتخاب شده معتبر نیستند",
            });
          }

          // 1️⃣ آپدیت وضعیت چالش
          await userCh.update({ status: "closed" }, { transaction: t });

          // 2️⃣ ثبت رویداد رد شدن
          const rejection = await ChallengeRejection.create(
            {
              user_challenge_id: userCh.id,
              challenge_type_id: userCh?.ChallengePlan?.challenge_type_id,
              admin_id: req?.admin?.id,
              description,
            },
            { transaction: t },
          );

          // 3️⃣ ثبت آیتم‌های دلایل
          const rejectionItems = reason_ids.map((reasonId) => ({
            challenge_rejection_id: rejection.id,
            reason_id: reasonId,
          }));

          await ChallengeRejectionItem.bulkCreate(rejectionItems, {
            transaction: t,
          });

          // 4️⃣ ثبت تاریخچه
          await HistoryChallenge.create(
            {
              type: "challenge_rejected",
              user_challenge_id: user_challenge_id,
              admin_id: req?.admin?.id,
              title: `چالش رد شد (${reason_ids.length} دلیل ثبت شد)`,
            },
            { transaction: t },
          );

          await t.commit();

          return this.response({
            res,
            status: 200,
            message: "چالش با موفقیت رد شد",
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
          return this.response({
            res,
            status: 400,
            message: "وضعیت ارسالی معتبر نیست",
          });
      }

      const findGroup = await ChallengePhase.findOne({
        where: {
          challenge_plan_id: userCh?.challenge_plan_id,
          phase_index: phaseIndex,
        },
        attributes: ["id", "group"],
      });

      // 3) آپدیت وضعیت کلی چالش
      await userCh.update(
        {
          status,
          current_phase_index: phaseIndex,
          challenge_phase: findGroup?.id,
        },
        { transaction: t },
      );
      await HistoryChallenge.create(
        {
          type: "change_status",
          user_challenge_id: req?.body?.user_challenge_id,
          admin_id: req?.admin?.id,
          title: `وضعیت چالش ${typesStatus[status]} تغییر پیدا کرد`,
        },
        { transaction: t },
      );

      // 4) ساخت/پیدا کردن AccountInstance برای این فاز
      // cycle_no: برای real بعد از payout احتمالاً cycle_no زیاد می‌شود.
      // فعلاً 1 می‌گذاریم. (بعداً برای payout می‌کنی 2,3,...)
      const acc = await getOrCreateAccountInstance({
        userChallenge: userCh,
        phaseIndex,
        cycleNo: 1,
        t,
        platform: req?.body?.platform || "mt5",
        adminId: req?.admin?.id,
        findUser: user,
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
        platform: req?.body?.platform || "mt5",
        findUser: user,
      });

      // 07 ساخت گواهینامه
      const certificatePhase = getCertificatePhase(perPhaseIndex, phaseIndex);
      let certificatePayload;
      if (certificatePhase) {
        // اینجا فقط دیتا جمع می‌کنیم
        certificatePayload = {
          user,
          phase: certificatePhase,
          total_profit: 0,
          withdraw_profit: 0,
        };
      }

      await t.commit();

      // ⬅️ مهم: بیرون از transaction
      if (certificatePayload) {
        createPhaseCertificate(certificatePayload).catch((err) =>
          console.error("CERTIFICATE ERROR:", err),
        );
      }

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
      return this.response({
        res,
        status: err.status || 500,
        message: err.message || "خطای سرور",
      });
    }
  }
  async userChallenges(req, res) {
    const where = {};

    if (req?.query?.user_id) where.user_id = req?.query?.user_id;
    if (req?.query?.status) where.status = req?.query?.status;
    if (req?.query?.id) where.id = { [Op.like]: `%${req?.query?.id}%` };

    const list = await founcList(UserChallenge, req, where, {
      include: [
        {
          model: ChallengePlan,
          attributes: [
            "id",
            "title",
            "balance",
            "floating_risk_type",
            "allow_insurance",
          ],
          include: [
            {
              model: ChallengeType,
              // as: "type",
            },
          ],
        },
        {
          model: AccountInstance,
          // as: "account_instances",
          attributes: [
            "id",
            "platform",
            "phase_index",
            "mt_login",
            "mt_group",
            "in_password",
            "mt_password",
            "starting_balance_usd",
            "status",
          ],
        },
        {
          model: User,
          attributes: ["id", "firstname", "lastname", "avatar"],
        },
      ],
      attributes: [
        "id",
        "status",
        "current_phase_index",
        "price_usd",
        "floating_risk_enabled",
        "has_insurance",
        "coupon_code_snapshot",
        "createdAt",
        "updatedAt",
      ],
    });

    this.response({ res, data: list });
  }
  async singleChallenge(req, res) {
    const singleCh = await UserChallenge?.findByPk(req?.params?.id, {
      include: [
        {
          model: ChallengePlan,
          include: [ChallengeType, ChallengePhase],
        },
        {
          model: User,
          attributes: [
            "id",
            "firstname",
            "lastname",
            "avatar",
            "mobile",
            "createdAt",
          ],
        },
        {
          model: AccountInstance,
          include: [
            {
              model: Admin,
              as: "created_by_admin",
              attributes: ["id", "name", "avatar"],
            },
          ],
        },
        {
          model: HistoryChallenge,
          include: [
            {
              model: Admin,
              attributes: ["id", "name", "avatar"],
            },
          ],
        },
        {
          model: Order,
          include: [
            {
              model: Admin,
              attributes: ["id", "name", "avatar"],
            },
          ],
        },
      ],
    });

    if (!singleCh)
      return this.response({
        res,
        status: 400,
        message:
          "ادمین مای پراپ، چالشی با این شناسه یافت نشد لطفا دوباره امتحان کنید",
      });

    this.response({
      res,
      status: 200,
      message: "اطلاعات چالش",
      data: singleCh,
    });
  }
  async createChallenge(req, res, next) {
    const t = await sequelize.transaction();
    try {
      /**
       * ورودی‌های لازم:
       * req.body.user_id
       * req.body.challenge_plan_id
       * بقیه چیزهایی که createChFounc نیاز داره
       */

      // 1) fake user برای reuse منطق
      const targetUser = await User.findByPk(req.body.user_id);
      if (!targetUser) {
        await t.rollback();
        return this.response({
          res,
          status: 404,
          message: "کاربر یافت نشد",
        });
      }

      // ⚠️ چون createChFounc از req.user استفاده می‌کنه
      const fakeReq = {
        ...req,
        user: targetUser,
        body: {
          ...req.body,
          gateway: "admin", // صرفاً جهت لاگ یا تشخیص
        },
      };

      // 2) ساخت چالش + order + payment
      const chData = await createChFounc(fakeReq, res, next, t);

      await t.commit();
      return this.response({
        res,
        status: 201,
        message: "چالش با موفقیت ساخته شد و در انتظار پرداخت کاربر است",
        data: {
          user_challenge_id: chData?.userChallenge.id,
          order_id: chData?.order?.gateway_order_id,
          challenge_status: chData?.userChallenge?.status,
        },
      });
    } catch (err) {
      await t.rollback();
      return this.response({
        res,
        status: err.status || 500,
        message: err.message || "خطای سرور",
      });
    }
  }
  async rejectedRasions(req, res) {
    const list = await ChallengeRejectReason.findAll({
      where: { is_active: 1 },
    });

    this.response({ res, status: 200, data: list });
  }
  async getRejectionReasonsByUserChallengeId(req, res) {
    try {
      const userChallengeId = req?.params?.user_challenge_id;

      const rejection = await ChallengeRejection.findOne({
        where: {
          user_challenge_id: userChallengeId,
        },
        include: [
          {
            model: ChallengeRejectionItem,
            as: "items",
            include: [
              {
                model: ChallengeRejectReason,
                as: "reason",
                attributes: ["id", "title", "code", "category"],
              },
            ],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      if (!rejection) {
        this.response({ res, status: 200, data: null });
      }

      this.response({
        res,
        data: {
          id: rejection?.id,
          description: rejection?.description,
          admin: rejection?.admin,
          reasons: rejection?.items?.map((item) => item.reason),
        },
      });
    } catch (error) {
      console.error(error);
      this.response({ res, status: 200, data: null });
    }
  }
  async getAnalysisData(req, res) {
    const mt_login = req?.params?.mt_login;
    if (!mt_login)
      return this.response({
        res,
        status: 400,
        message: "ارسال شناسه لاگین اجباری است",
      });

    const dataAccount = await fetchFullAccountAnalysis(mt_login);

    this.response({
      res,
      status: 200,
      message: "اطلاعات اکانت شما",
      data: { dataAccount },
    });
  }
};

module.exports = new Controller();
