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
const founcList = require("../../../../utils/List");
const sequelize = require("../../../../../db");
const { Op } = require("sequelize");

const Controller = class extends Controllers {
  async listUsers(req, res) {
    const where = {};
    const { query } = req
    if (query?.mobile) {
      where.mobile = { [Op.like]: `%${query?.mobile}%` }
    }
    if (query?.lastname) {
      where.lastname = { [Op.like]: `%${query?.lastname}%` }
    }
    if (query?.id) {
      where.id = { [Op.like]: `%${query?.id}%` }
    }
    if (query.from || query.to) {
      where.created_at = {};
      if (query.from) {
        where.created_at[Op.gte] = new Date(query.from);
      }
      if (query.to) {
        where.created_at[Op.lte] = new Date(query.to);
      }
    }
    if (query?.status) {
      where.status = query?.status
    }
    if (query?.kyc_status) {
      where.kyc_status = query?.kyc_status
    }

    const list = await founcList(User, req, where, { attributes: ["id", "avatar", "firstname", "lastname", "mobile", "status", "createdAt", "kyc_steep", "kyc_status"] })

    this.response({ res, message: "لیست کاربران", data: list })
  }
  async createUser(req, res) {
    const { firstname, lastname, mobile, email, password } = req?.body
    const userFind = await User.findOne({ where: { mobile } });
    if (userFind) return this.response({ res, status: 400, message: "کاربری با این شماره موبایل یافت شد" })


    await User.create({
      firstname, lastname, mobile, email, password,
      status: "approved",
      verify_mobile: true
    })
    this.response({ res, status: 201, message: "کاربر با موفقیت ساخته شد", })
  }
  async findUser(req, res) {
    const user = await User.findByPk(req?.params?.id, { attributes: { exclude: ["password"] } });
    if (!user) return this.response({ res, status: 400, message: "کاربری با این مشخصات پیدا نشد" });

    // wallet
    const wallet = await Wallet.findOne({ where: { user_id: user?.id } });
    const setting = await Setting.findOne({ where: { id: 1 } });
    const amount_irr = wallet?.balance * setting?.dollar_price


    // messages
    const messages = await SmsMessage.findAll({
      where: { user_id: user?.id },
      limit: 2,
    })

    // calls
    const calls = await Call.findAll({
      where: { user_id: user?.id },
      limit: 2,
    })

    // transactions
    const transactions = await WalletTransaction.findAll({
      where: { wallet_id: wallet?.id },
      limit: 2,
    })

    // orders
    const orders = await Order.findAll({
      where: { user_id: user?.id },
      limit: 2,
      attributes: ["id", "type", "amount_usd"],
      include: [{
        model: UserChallenge,
        attributes: ["id", "current_phase_index", "status"],
        include: {
          model: ChallengePlan,
          attributes: ["id", "title", "balance"],
          include: {
            model: ChallengeType,
          }
        }
      }]
    })

    // requestWidthdraw
    const requestWidthdraw = await Ticket.findAll({
      where: { user_id: user?.id, type: "widthdraw" },
      limit: 2,
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
            }
          }
        }
      ]
    })

    // referrer
    const listUsersRefral = await ReferralCommission.findAll({
      attributes: [
        "referred_user_id",
        [sequelize.fn("SUM", sequelize.col("order_amount")), "total_paid"],
        [sequelize.fn("SUM", sequelize.col("commission_amount")), "total_commission"],
      ],
      include: [
        {
          model: User,
          as: "referredUser",
          attributes: ["id", "avatar", "firstname", "lastname"],
        },
      ],
      group: ["referred_user_id", "referredUser.id"],
      order: [[sequelize.literal("total_paid"), "DESC"]],
      limit: 2,
      where: { referrer_id: user?.id }
    })


    this.response({
      res, message: "اطلاعات کاربری", data: {
        user,
        wallet: {
          ...wallet.dataValues,
          amount_irr
        },
        transactions,
        orders,
        requestWidthdraw,
        listUsersRefral,
        calls,
        messages
      }
    })
  }
  async updateUser(req, res) {
    delete req?.body?.password
    const user = await User.update(req?.body, { where: { id: req?.params?.id } });
    if (!user) return this.response({ res, status: 400, message: "کاربری با این مشخصات پیدا نشد" });

    this.response({ res, message: "اطلاعات کاربر ذخیره شد", })
  }
  async depositWallet(req, res) {
    const wallet = await Wallet.findByPk(req?.body?.wallet_id);
    await wallet.update({ balance: Number(wallet?.balance) + Number(req?.body?.amount) });

    this.response({ res, message: "موجودی افزایش پیدا کرد" })

  }
};

module.exports = new Controller();
