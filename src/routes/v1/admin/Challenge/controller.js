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
const ChallengeNote = require("../../../../models/ChallengeNote");
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

const createPhaseCertificate = require("../../../../utils/CreateCt");

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

    // risks params
    daily_risk_percent: plan?.max_daily_drawdown_percent,
    overall_risk_percent: plan?.max_overall_drawdown_percent,
    floating_risk_percent: plan?.floating_risk_value
      ? plan?.floating_risk_value
      : 0,
  });

  console.log(plan?.floating_risk_value ? plan?.floating_risk_value : 0);
  console.log(plan);

  console.log(result);

  if (!result?.Login && !result?.login) {
    const err = new Error("ساخت حساب ناموفق بود");
    err.status = 500;
    throw err;
  }

  await acc.update(
    {
      mt_login: String(result?.Login || result?.login),
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
              "floating_risk_value",
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
      // const certificatePhase = getCertificatePhase(perPhaseIndex, phaseIndex);
      // let certificatePayload;
      // if (certificatePhase) {
      //   // اینجا فقط دیتا جمع می‌کنیم
      //   certificatePayload = {
      //     user_id: user?.id,
      //     fullName: user?.firstname + " " + user?.lastname,
      //     phase: certificatePhase,
      //     total_profit: 0,
      //     withdraw_profit: 0,
      //   };
      // }

      await t.commit();

      // ⬅️ مهم: بیرون از transaction
      // if (certificatePayload) {
      //   createPhaseCertificate(certificatePayload).catch((err) =>
      //     console.error("CERTIFICATE ERROR:", err),
      //   );
      // }

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

    const accountInstanceWhere = {};
    if (req?.query?.mt_login) {
      // accountInstanceWhere.mt_login = req.query.mt_login;
      accountInstanceWhere.mt_login = { [Op.like]: `%${req.query.mt_login}%` };
    }

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
          where:
            Object.keys(accountInstanceWhere).length > 0
              ? accountInstanceWhere
              : null,
          required: Object.keys(accountInstanceWhere).length > 0,
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
      order: [["createdAt", "DESC"]],
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

      if (req?.body?.note) {
        await ChallengeNote.create({
          note: req?.body?.note,
          admin_id: req?.admin?.id,
          user_challenge_id: chData?.userChallenge.id,
        });
      }

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
  async changeDetailAccount(req, res) {
    const accountInstanceFind = await AccountInstance.findByPk(
      req?.body?.account_instance_id,
    );
    if (!accountInstanceFind)
      return this.response({ res, status: 400, message: "اکانتی یافت نشد" });

    await accountInstanceFind.update({
      mt_login: req?.body?.mt_login || accountInstanceFind?.mt_login,
      mt_password: req?.body?.mt_password || accountInstanceFind?.mt_password,
      in_password: req?.body?.in_password || accountInstanceFind?.in_password,
    });

    this.response({ res, message: "اطلاعات اکانت با موفقیت ویرایش شد" });
  }
  async ordersList(req, res) {
    const where = {};

    if (req?.query?.gateway) where.gateway = req?.query?.gateway;
    if (req?.query?.type) where.type = req?.query?.type;
    if (req?.query?.user_id) where.user_id = req?.query?.user_id;
    if (req?.query?.status) where.status = req?.query?.status;

    const ordersList = await founcList(Order, req, where, {
      distinct: true,
      subQuery: false,
      include: [
        {
          model: UserChallenge,
          attributes: ["id"],
          required: false,
        },
        {
          model: User,
          attributes: ["id", "firstname", "lastname"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    this.response({ res, status: 200, data: ordersList });
  }
  async createNote(req, res) {
    await ChallengeNote.create({
      note: req?.body?.note,
      admin_id: req?.admin?.id,
      user_challenge_id: req?.body?.user_challenge_id,
    });

    this.response({
      res,
      status: 201,
      message: "یادداشت شما با موفقیت ساخته شد",
    });
  }
  async notsList(req, res) {
    const notsList = await ChallengeNote.findAll({
      where: { user_challenge_id: req?.params?.user_challenge_id },
    });

    this.response({ res, data: notsList });
  }
  async ordersListPdf(req, res, next) {
    try {
      const where = {};

      if (req?.query?.gateway) where.gateway = req.query.gateway;
      if (req?.query?.type) where.type = req.query.type;
      if (req?.query?.user_id) where.user_id = Number(req.query.user_id);
      if (req?.query?.status) where.status = req.query.status;

      const orders = await Order.findAll({
        where,
        include: [
          {
            model: UserChallenge,
            attributes: ["id"],
            required: false,
          },
          {
            model: User,
            attributes: ["id", "firstname", "lastname"],
            required: false,
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      const formatPrice = (value) =>
        new Intl.NumberFormat("fa-IR").format(Number(value || 0));

      const formatDate = (value) =>
        value
          ? new Intl.DateTimeFormat("fa-IR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(value))
          : "-";

      const getUserFullName = (item) => {
        const firstname = item?.User?.firstname || "";
        const lastname = item?.User?.lastname || "";
        const fullName = `${firstname} ${lastname}`.trim();
        return fullName || "-";
      };

      const rows = orders
        .map(
          (item, index) => `
          <tr>
            <td class="center">${index + 1}</td>
            <td>${item.id ?? "-"}</td>
            <td>${item.gateway_order_id ?? "-"}</td>
            <td>${getUserFullName(item)}</td>
            <td>${item.gateway || "-"}</td>
            <td>${item.type || "-"}</td>
            <td>
              <span class="badge badge-${item.status || "default"}">
                ${item.status || "-"}
              </span>
            </td>
            <td class="num">${formatPrice(item.amount_usd)}</td>
            <td class="num">${formatPrice(item.amount_irr ?? Number(item.amount_usd || 0) * 1800000)}</td>
            <td class="center">${item.UserChallenge?.id || "-"}</td>
            <td class="nowrap">${formatDate(item.createdAt)}</td>
          </tr>
        `,
        )
        .join("");

      const html = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="X-UA-Compatible" content="IE=edge" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            @page {
              size: A4 landscape;
              margin: 18px;
            }

            * {
              box-sizing: border-box;
            }

            html, body {
              direction: rtl;
              margin: 0;
              padding: 0;
              font-family: Tahoma, Arial, "Noto Sans Arabic", "Noto Sans", sans-serif;
              font-size: 12px;
              color: #111827;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .wrapper {
              width: 100%;
              padding: 8px;
            }

            .header {
              margin-bottom: 16px;
              padding-bottom: 12px;
              border-bottom: 2px solid #e5e7eb;
            }

            .title {
              margin: 0 0 8px 0;
              font-size: 18px;
              font-weight: 700;
              color: #111827;
            }

            .meta {
              display: flex;
              flex-wrap: wrap;
              gap: 12px;
              font-size: 11px;
              color: #4b5563;
            }

            .meta span {
              background: #f9fafb;
              border: 1px solid #e5e7eb;
              padding: 6px 10px;
              border-radius: 8px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              background: #fff;
            }

            thead {
              display: table-header-group;
            }

            th, td {
              border: 1px solid #d1d5db;
              padding: 8px 6px;
              text-align: center;
              vertical-align: middle;
              word-break: break-word;
            }

            th {
              background: #1f2937;
              color: #fff;
              font-size: 11px;
              font-weight: 700;
              white-space: nowrap;
            }

            tbody tr:nth-child(even) {
              background: #f9fafb;
            }

            tbody tr:hover {
              background: #f3f4f6;
            }

            .center {
              text-align: center;
            }

            .num {
              text-align: left;
              direction: ltr;
              unicode-bidi: plaintext;
              white-space: nowrap;
            }

            .nowrap {
              white-space: nowrap;
              direction: ltr;
              unicode-bidi: plaintext;
            }

            .badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 999px;
              font-size: 10px;
              font-weight: 700;
              line-height: 1.2;
              white-space: nowrap;
            }

            .badge-success {
              background: #dcfce7;
              color: #166534;
            }

            .badge-failed, .badge-fail {
              background: #fee2e2;
              color: #991b1b;
            }

            .badge-pending {
              background: #fef3c7;
              color: #92400e;
            }

            .badge-canceled, .badge-cancelled {
              background: #e5e7eb;
              color: #374151;
            }

            .badge-default {
              background: #e0e7ff;
              color: #3730a3;
            }

            .empty {
              text-align: center;
              padding: 24px;
              color: #6b7280;
            }

            .footer {
              margin-top: 14px;
              font-size: 10px;
              color: #6b7280;
              text-align: left;
              direction: ltr;
              unicode-bidi: plaintext;
            }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="header">
              <h1 class="title">گزارش تراکنش‌ها</h1>
              <div class="meta">
                <span>تعداد کل: ${formatPrice(orders.length)}</span>
                <span>تاریخ تولید: ${formatDate(new Date())}</span>
                ${req?.query?.gateway ? `<span>درگاه: ${req.query.gateway}</span>` : ""}
                ${req?.query?.type ? `<span>نوع: ${req.query.type}</span>` : ""}
                ${req?.query?.status ? `<span>وضعیت: ${req.query.status}</span>` : ""}
                ${req?.query?.user_id ? `<span>کاربر: ${req.query.user_id}</span>` : ""}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 40px;">#</th>
                  <th style="width: 70px;">ID</th>
                  <th style="width: 70px;">شماره سفارش</th>
                  <th style="width: 140px;">نام کاربر</th>
                  <th style="width: 90px;">درگاه</th>
                  <th style="width: 90px;">نوع</th>
                  <th style="width: 90px;">وضعیت</th>
                  <th style="width: 95px;">مبلغ دلاری</th>
                  <th style="width: 110px;">مبلغ ریالی</th>
                  <th style="width: 85px;">Challenge</th>
                  <th style="width: 120px;">تاریخ</th>
                </tr>
              </thead>
              <tbody>
                ${
                  rows ||
                  `<tr><td class="empty" colspan="10">داده‌ای یافت نشد</td></tr>`
                }
              </tbody>
            </table>

            <div class="footer">
              Generated by MyProp • ${new Date().toISOString()}
            </div>
          </div>
        </body>
      </html>
    `;

      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--font-render-hinting=medium",
        ],
      });

      try {
        const page = await browser.newPage();

        await page.setViewport({
          width: 1600,
          height: 900,
          deviceScaleFactor: 1,
        });

        await page.setContent(html, { waitUntil: "load" });
        await page.emulateMediaType("screen");

        const pdfBuffer = await page.pdf({
          format: "A4",
          landscape: true,
          printBackground: true,
          preferCSSPageSize: true,
          margin: {
            top: "18px",
            right: "18px",
            bottom: "18px",
            left: "18px",
          },
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=orders-${Date.now()}.pdf`,
        );

        return res.end(pdfBuffer);
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error("PDF ERROR:", error);
      return res.status(500).json({
        message: error.message,
        stack: error.stack,
      });
    }
  }
  async resetAccountPhase(req, res) {
    const {
      user_challenge_id,
      phase_index,
      cycle_no,
      reason,
      platform = "ctrader",
    } = req.body;

    const adminId = req.admin?.id;

    if (!user_challenge_id || phase_index === undefined) {
      return this.response({
        res,
        status: 400,
        message: "user_challenge_id و phase_index الزامی هستند",
      });
    }

    let accountId;
    let oldAccount;
    let userChallenge;
    let oldStatus;

    try {
      await sequelize.transaction(async (t) => {
        userChallenge = await UserChallenge.findByPk(user_challenge_id, {
          include: [
            {
              model: ChallengePlan,
              required: true,
            },
            {
              model: User,
              required: false,
              attributes: ["id", "firstname", "lastname", "email"],
            },
          ],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!userChallenge) {
          const error = new Error("چالش کاربر پیدا نشد");
          error.status = 404;
          throw error;
        }

        const accountWhere = {
          user_challenge_id,
          phase_index: Number(phase_index),
        };

        if (cycle_no !== undefined && cycle_no !== null) {
          accountWhere.cycle_no = Number(cycle_no);
        }

        const account = await AccountInstance.findOne({
          where: accountWhere,
          transaction: t,
          lock: t.LOCK.UPDATE,
          order: [["cycle_no", "DESC"]],
        });

        if (!account) {
          const error = new Error("اکانت مرحله موردنظر پیدا نشد");
          error.status = 404;
          throw error;
        }

        const challengeTypeId = userChallenge.challenge_type_id;
        const challengePlanId = userChallenge.challenge_plan_id;

        const phaseAccount = await ChallengePhase.findOne({
          where: {
            challenge_type_id: challengeTypeId,
            challenge_plan_id: challengePlanId,
            phase_index: account.phase_index,
            platform: platform,
          },
          attributes: ["id", "group"],
          transaction: t,
        });

        console.log({
          challenge_type_id: challengeTypeId,
          challenge_plan_id: challengePlanId,
          phase_index: account.phase_index,
          platform: platform,
        });

        console.log("Phase found:", phaseAccount?.toJSON());

        if (!phaseAccount || !phaseAccount.group) {
          const error = new Error(
            `گروه معاملاتی برای این مرحله تعریف نشده است (Phase: ${account.phase_index})`,
          );
          error.status = 400;
          throw error;
        }

        accountId = account.id;
        oldStatus = account.status;

        oldAccount = {
          mt_login: account.mt_login,
          mt_group: phaseAccount.group,
          mt_server: phaseAccount.group,
          starting_balance_usd: Number(account.starting_balance_usd),
          phase_index: account.phase_index,
          cycle_no: account.cycle_no,
        };
      });
    } catch (error) {
      return this.response({
        res,
        status: error.status || 500,
        message: error.message || "خطا در آماده‌سازی ریست اکانت",
      });
    }

    /**
     * مرحله دوم:
     * ساخت حساب جدید در MT5 / cTrader
     */
    let mtResult;
    let inPassword;
    let mPassword;

    try {
      const plan = userChallenge.ChallengePlan;
      const findUser = userChallenge.User;

      const mtGroup = oldAccount.mt_group || oldAccount.mt_server;

      if (!mtGroup) {
        throw new Error("گروه معاملاتی اکانت مشخص نیست");
      }

      inPassword = generateMainPassword();
      mPassword = generateMainPassword();

      mtResult = await createTradingAccount({
        provider: platform,

        order_id: `reset-${accountId}-${Date.now()}`,

        balance: oldAccount.starting_balance_usd,
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

        // cTrader fields
        email: findUser?.email,
        first_name: findUser?.firstname,
        last_name: findUser?.lastname,

        // Risk params
        daily_risk_percent: Number(plan.max_daily_drawdown_percent),
        overall_risk_percent: Number(plan.max_overall_drawdown_percent),
        floating_risk_percent: Number(plan.floating_risk_value || 0),
      });

      const newMtLogin = mtResult?.Login || mtResult?.login;

      if (!newMtLogin) {
        throw new Error("ساخت حساب معاملاتی جدید ناموفق بود");
      }
    } catch (error) {
      /**
       * ساخت MT ناموفق بوده؛ وضعیت اکانت را به وضعیت قبلی برمی‌گردانیم.
       */
      await sequelize.transaction(async (t) => {
        const account = await AccountInstance.findByPk(accountId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (account) {
          await account.update(
            {
              status: oldStatus || "active",
            },
            { transaction: t },
          );
        }

        await ChallengeNote.create(
          {
            user_challenge_id,
            admin_id: adminId,
            note:
              `❌ تلاش برای ریست حساب ناموفق بود | ` +
              `Phase: ${oldAccount.phase_index} | ` +
              `Cycle: ${oldAccount.cycle_no} | ` +
              `MT Login قبلی: ${oldAccount.mt_login} | ` +
              `خطا: ${error.message}`,
          },
          { transaction: t },
        );
      });

      return this.response({
        res,
        status: 500,
        message: error.message || "ساخت حساب جدید ناموفق بود",
      });
    }

    /**
     * مرحله سوم:
     * اتصال MT جدید به AccountInstance و ثبت Note
     */
    try {
      const newMtLogin = String(mtResult?.Login || mtResult?.login);
      const newMtGroup = oldAccount.mt_group || oldAccount.mt_server;

      await sequelize.transaction(async (t) => {
        const account = await AccountInstance.findByPk(accountId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!account) {
          const error = new Error("رکورد اکانت پس از ساخت MT پیدا نشد");
          error.status = 404;
          throw error;
        }

        await account.update(
          {
            // اطلاعات MT جدید
            mt_login: newMtLogin,
            mt_server: newMtGroup,
            mt_group: newMtGroup,
            email: mtResult?.email || userChallenge.User?.email || null,

            // رمزهای جدید
            // پیشنهاد: قبل از ذخیره Encrypt شوند
            mt_password: mPassword,
            in_password: inPassword,

            // وضعیت جدید
            status: "active",
            activated_at: new Date(),

            /**
             * فیلدهای زیر را فقط اگر در مدل AccountInstance داری نگه دار.
             * نام‌ها را با مدل خودت هماهنگ کن.
             */
            current_balance_usd: Number(account.starting_balance_usd),
            equity_usd: Number(account.starting_balance_usd),
            profit_usd: 0,
            total_trades: 0,
            total_lots: 0,
            max_drawdown_usd: 0,
            max_daily_drawdown_usd: 0,
            failed_at: null,
            completed_at: null,
          },
          { transaction: t },
        );

        await ChallengeNote.create(
          {
            user_challenge_id,
            admin_id: adminId,
            note:
              `🔄 حساب مرحله با موفقیت ریست شد | ` +
              `Phase: ${oldAccount.phase_index} | ` +
              `Cycle: ${oldAccount.cycle_no} | ` +
              `MT قبلی: ${oldAccount.mt_login} | ` +
              `MT جدید: ${newMtLogin} | ` +
              (reason ? ` | دلیل: ${reason}` : ""),
          },
          { transaction: t },
        );
      });

      return this.response({
        res,
        status: 200,
        message: "اکانت مرحله با موفقیت ریست شد",
        data: {
          account_instance_id: accountId,
          phase_index: oldAccount.phase_index,
          cycle_no: oldAccount.cycle_no,
          old_mt_login: oldAccount.mt_login,
          new_mt_login: newMtLogin,
          mt_group: newMtGroup,
        },
      });
    } catch (error) {
      return this.response({
        res,
        status: error.status || 500,
        message:
          error.message ||
          "اکانت MT ساخته شد، اما ذخیره‌سازی اطلاعات آن ناموفق بود",
      });
    }
  }
};

module.exports = new Controller();
