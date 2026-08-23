const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const Wallet = require("../../../../models/Wallet");
const WalletTransaction = require("../../../../models/WalletTransaction");
const Order = require("../../../../models/Order");
const Setting = require("../../../../models/Setting");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const Ticket = require("../../../../models/Ticket");
const ReferralCommission = require("../../../../models/ReferralCommission");
const Call = require("../../../../models/Call/Call");
const SmsMessage = require("../../../../models/SmsMessage");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const Admin = require("../../../../models/Admin");
const UserNote = require("../../../../models/UserNote");
const UserDevice = require("../../../../models/UserDevice");
const founcList = require("../../../../utils/List");
const sequelize = require("../../../../../db");
const { Op, fn, col, literal } = require("sequelize");
const bcrypt = require("bcrypt");

const Controller = class extends Controllers {
  async listUsers(req, res) {
    const where = {};
    const { query } = req;
    if (query?.mobile) {
      where.mobile = { [Op.like]: `%${query?.mobile}%` };
    }
    if (query?.lastname) {
      where.lastname = { [Op.like]: `%${query?.lastname}%` };
    }
    if (query?.firstname) {
      where.firstname = { [Op.like]: `%${query?.firstname}%` };
    }
    if (query?.id) {
      where.id = { [Op.like]: `%${query?.id}%` };
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt[Op.gte] = new Date(query.from);
      }
      if (query.to) {
        where.createdAt[Op.lte] = new Date(query.to);
      }
    }
    if (query?.status) {
      where.status = query?.status;
    }
    if (query?.kyc_status) {
      where.kyc_status = query?.kyc_status;
    }

    const list = await founcList(User, req, where, {
      attributes: [
        "id",
        "avatar",
        "firstname",
        "lastname",
        "mobile",
        "status",
        "createdAt",
        "kyc_steep",
        "kyc_status",
      ],
      order: [["id", "ASC"]],
    });

    this.response({ res, message: "لیست کاربران", data: list });
  }
  async createUser(req, res) {
    const { firstname, lastname, mobile, email, password } = req?.body;
    const userFind = await User.findOne({ where: { mobile } });
    if (userFind)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این شماره موبایل یافت شد",
      });

    await User.create({
      firstname,
      lastname,
      mobile,
      email,
      password,
      status: "approved",
      verify_mobile: true,
    });
    this.response({ res, status: 201, message: "کاربر با موفقیت ساخته شد" });
  }
  async findUserDefaultData(req, res) {
    const user = await User.findByPk(req?.params?.id, {
      attributes: {
        exclude: ["password", "refresh_token", "refresh_token_expires_at"],
      },
    });
    if (!user)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این مشخصات پیدا نشد",
      });

    this.response({ res, message: "اطلاعات کاربر", data: user });
  }
  async findUser(req, res) {
    const user = await User.findByPk(req?.params?.id, {
      attributes: {
        exclude: ["refresh_token", "refresh_token_expires_at"],
      },
    });
    if (!user)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این مشخصات پیدا نشد",
      });

    // wallet
    const wallet = await Wallet.findOne({ where: { user_id: user?.id } });
    const setting = await Setting.findOne({ where: { id: 1 } });
    const amount_irr =
      wallet?.balance *
      (Number(setting?.dollar_price) + Number(setting?.bonus_dollar));

    // messages
    const messages = await SmsMessage.findAll({
      where: { user_id: user?.id },
    });

    // calls
    const calls = await Call.findAll({
      where: { user_id: user?.id },
    });

    // // transactions
    // const transactions = await WalletTransaction.findAll({
    //   where: { wallet_id: wallet?.id },
    // });

    // // orders
    // const orders = await Order.findAll({
    //   where: { user_id: user?.id },
    //   attributes: ["id", "type", "amount_usd"],
    //   include: [
    //     {
    //       model: UserChallenge,
    //       attributes: ["id", "current_phase_index", "status"],
    //       include: {
    //         model: ChallengePlan,
    //         attributes: ["id", "title", "balance"],
    //         include: {
    //           model: ChallengeType,
    //         },
    //       },
    //     },
    //   ],
    // });

    const userChallenges = await UserChallenge.findAll({
      where: { user_id: user?.id },
      include: [
        {
          model: ChallengePlan,
          attributes: ["id", "title", "balance"],
          include: [ChallengeType],
        },
      ],
    });

    const walletTx = await WalletTransaction.findAll({
      where: { wallet_id: wallet?.id },
      attributes: [
        "id",
        "type",
        "amount",
        "status",
        "createdAt",
        "admin_id",
        "description",
        [sequelize.literal("'wallet'"), "source"],
      ],
      include: [
        {
          model: Admin,
          attributes: ["id", "name", "avatar"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // 3. orders
    const orderWhere = { user_id: user?.id };

    const orders = await Order.findAll({
      where: orderWhere,
      attributes: ["id", "type", "amount_usd", "status", "createdAt"],
      include: [
        {
          model: UserChallenge,
          attributes: ["id", "current_phase_index", "status"],
          include: {
            model: ChallengePlan,
            attributes: ["id", "title", "balance"],
            include: {
              model: ChallengeType,
              attributes: ["id", "name"],
            },
          },
        },
      ],
    });

    // normalize orders
    const normalizedOrders = orders.map((o) => ({
      id: o.id,
      source: "order",
      type: o.type,
      amount: o.amount_usd,
      status: o.status,
      createdAt: o.created_at || o?.createdAt,
      meta: o.UserChallenge
        ? {
            challenge_id: o.UserChallenge.id,
            phase: o.UserChallenge.current_phase_index,
            challenge_status: o.UserChallenge.status,
            plan: o.UserChallenge.ChallengePlan?.title,
            challenge_type: o.UserChallenge.ChallengePlan?.ChallengeType?.title,
          }
        : null,
    }));

    // 4. merge
    let items = [...walletTx, ...normalizedOrders];

    // 5. sort
    items.sort(
      (a, b) =>
        new Date(b.created_at || b?.createdAt) -
        new Date(a.created_at || a?.createdAt),
    );

    // requestWidthdraw
    const requestWidthdraw = await Ticket.findAll({
      where: { user_id: user?.id, type: "widthdraw" },
      attributes: ["id", "title", "status", "type", "createdAt"],
      include: [
        {
          model: UserChallenge,
          as: "challenge",
          attributes: ["id", "current_phase_index", "status"],
          include: {
            model: ChallengePlan,
            attributes: ["id", "title", "balance"],
            include: {
              model: ChallengeType,
            },
          },
        },
      ],
    });

    const listUsersRefral = await User.findAll({
      where: {
        referrer_id: user?.id,
      },
      attributes: [
        "id",
        "firstname",
        "lastname",
        "avatar",
        "mobile",
        "email",
        "createdAt",

        [
          fn("COALESCE", fn("SUM", col("referralEarnings.order_amount")), 0),
          "total_paid",
        ],
        [
          fn(
            "COALESCE",
            fn("SUM", col("referralEarnings.commission_amount")),
            0,
          ),
          "total_commission",
        ],
      ],
      include: [
        {
          model: ReferralCommission,
          as: "referralEarnings",
          attributes: [],
          required: false, // 👈 حتی اگه commission نداشت بیاد
          where: {
            status: {
              [Op.in]: ["approved", "paid"],
            },
          },
        },
      ],
      group: ["User.id"],
      order: [[literal("total_paid"), "DESC"]],
      subQuery: false,
    });

    // tickets
    const tickets = await Ticket.findAll({
      where: { user_id: user?.id, type: "ticket" },
      attributes: ["id", "title", "status", "type", "createdAt"],
    });

    this.response({
      res,
      message: "اطلاعات کاربری",
      data: {
        user,
        wallet: {
          ...wallet.dataValues,
          amount_irr,
        },
        // transactions,
        // orders,
        transactionsList: items,
        requestWidthdraw,
        listUsersRefral,
        calls,
        messages,
        userChallenges,
        tickets,
      },
    });
  }
  async updateUser(req, res) {
    delete req?.body?.password;
    const user = await User.update(req?.body, {
      where: { id: req?.params?.id },
    });
    if (!user)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این مشخصات پیدا نشد",
      });

    this.response({ res, message: "اطلاعات کاربر ذخیره شد" });
  }
  async changePassword(req, res) {
    if (!req?.body?.newPassword)
      return this.response({
        res,
        status: 400,
        message: "ارسال رمز عبور اجباری است",
      });

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(req?.body?.newPassword, salt);

    const user = await User.update(
      { password: newPasswordHash },
      {
        where: { id: req?.body?.user_id },
      },
    );

    if (!user)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این مشخصات پیدا نشد",
      });

    await UserNote.create({
      note: `تغییر رمز عبور توسط ادمین`,
      user_id: req?.body?.user_id,
      admin_id: req?.admin?.id,
    });

    this.response({ res, message: "رمز عبور کاربر ویرایش شد" });
  }
  async depositWallet(req, res) {
    const wallet = await Wallet.findByPk(req?.body?.wallet_id);
    const balance_before = Number(wallet?.balance);
    const balance_after = Number(wallet?.balance) + Number(req?.body?.amount);
    await wallet.update({
      balance: balance_after,
    });

    const newTransaction = await WalletTransaction.create({
      type: "deposit",
      amount: Number(req?.body?.amount),
      balance_before,
      balance_after,
      status: "completed",
      actor_type: "admin",
      admin_id: req?.admin?.id,
      wallet_id: wallet?.id,
      description: req?.body?.description,
    });

    this.response({ res, message: "موجودی افزایش پیدا کرد" });
  }
  async withdrawWallet(req, res) {
    const wallet = await Wallet.findByPk(req?.body?.wallet_id);
    await wallet.update({
      balance: Number(wallet?.balance) - Number(req?.body?.amount),
    });

    const balance_before = Number(wallet?.balance);
    const balance_after = Number(wallet?.balance) - Number(req?.body?.amount);

    const newTransaction = await WalletTransaction.create({
      type: "withdraw",
      amount: Number(req?.body?.amount),
      balance_before,
      balance_after,
      status: "completed",
      actor_type: "admin",
      admin_id: req?.admin?.id,
      wallet_id: wallet?.id,
      description: req?.body?.description,
    });

    this.response({ res, message: "موجودی ولت آپدیت شد" });
  }
  async createNote(req, res) {
    const newNote = await UserNote.create({
      note: req?.body?.note,
      user_id: req?.body?.user_id,
      admin_id: req?.admin?.id,
    });

    this.response({ res, status: 200, message: "یادداشت ساخته شد" });
  }
  async listNots(req, res) {
    const nots = await UserNote.findAll({
      where: { user_id: req?.params?.user_id },
      include: [
        {
          model: Admin,
          attributes: ["id", "name", "avatar"],
        },
      ],
    });

    this.response({ res, data: nots });
  }
  async changeStatusNote(req, res) {
    const findNote = await UserNote.findByPk(req?.body?.note_id);
    if (!findNote)
      return this.response({ res, status: 400, message: "یااداشت یافت نشد" });

    if (findNote.admin_id !== req?.admin?.id)
      return this.response({
        res,
        status: 400,
        message: "شما سازنده این یادداشت نیستید و امکان ویرایش ندارید",
      });

    await findNote.update({
      status: req?.body?.status,
      id: req?.body?.note_id,
    });

    return this.response({ res, status: 200, message: "یادداشت ویرایش شد" });
  }
  async listUserDevices(req, res) {
    try {
      const { user_id } = req.params;

      if (!user_id) {
        return this.response({
          res,
          status: 400,
          message: "شناسه کاربر الزامی است",
        });
      }

      const devices = await UserDevice.findAll({
        where: {
          user_id,
        },

        attributes: [
          "id",
          "user_id",
          "ip",
          "device_type",
          "browser",
          "os",
          "user_agent",
          "createdAt",
          "updatedAt",
        ],

        order: [["createdAt", "DESC"]],
      });

      this.response({
        res,
        message: "لیست دستگاه‌های کاربر",
        data: devices,
      });
    } catch (error) {
      console.error("List user devices error:", error);

      this.response({
        res,
        status: 500,
        message: "خطا در دریافت لیست دستگاه‌های کاربر",
      });
    }
  }
};

module.exports = new Controller();
