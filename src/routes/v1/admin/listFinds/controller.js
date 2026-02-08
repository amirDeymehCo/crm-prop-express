const Controllers = require("../../../controllers");
const UserChallenges = require("../../../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const User = require("../../../../models/User");
const CallRejectReason = require("../../../../models/Call/CallRejectReason");
const CallResultOption = require("../../../../models/Call/CallResultOption");
const ReferralCommission = require("../../../../models/ReferralCommission");
const founcList = require("../../../../utils/List");
const sequelize = require("../../../../../db");
const { fn, col, Op, literal } = require("sequelize");

const Controller = class extends Controllers {
  async users(req, res) {
    const where = {};

    const list = await User.findAll({
      where,
      attributes: ["id", "firstname", "lastname", "avatar", "mobile"],
      required: true,
    });

    const newFormat = list?.map((e) => ({
      ...e?.dataValues,
      value: e?.dataValues?.id,
      label:
        e?.dataValues?.firstname +
        "  " +
        e?.dataValues?.lastname +
        " -- " +
        e?.dataValues?.mobile,
    }));
    this.response({
      res,
      status: 200,
      message: "لیست چالش های شما به صورت خلاصه",
      data: newFormat,
    });
  }
  async rejectedOptions(req, res) {
    const options = await CallRejectReason.findAll();

    const newFormat = options?.map((e) => ({
      id: e?.id,
      value: e?.id,
      label: e?.title,
    }));
    this.response({ res, data: newFormat });
  }
  async resultOptions(req, res) {
    const options = await CallResultOption.findAll();

    const newFormat = options?.map((e) => ({
      id: e?.id,
      value: e?.id,
      label: e?.title,
    }));
    this.response({ res, data: newFormat });
  }
  async challenges(req, res) {
    const where = {};
    if (req?.query?.current_phase_index)
      where.current_phase_index = req?.query?.current_phase_index;
    if (req?.query?.user_id) where.user_id = req?.query?.user_id;

    const list = await UserChallenges.findAll({
      where,
      attributes: ["id", "status", "current_phase_index"],
      include: [
        {
          model: ChallengePlan,
          attributes: ["id", "title", "balance"],
          include: [ChallengeType],
        },
      ],
    });

    this.response({
      res,
      status: 200,
      message: "لیست چالش های شما به صورت خلاصه",
      data: list,
    });
  }
  async refral(req, res) {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const offset = (page - 1) * limit;

    const where = {
      referrer_id: {
        [Op.ne]: null,
      },
    };

    if (req?.query?.referrer_id) {
      where.referrer_id = req.query.referrer_id;
    }

    const usersRefral = await User.findAll({
      where,
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
        // ✅ اطلاعات کسی که معرفش بوده
        {
          model: User,
          as: "referrer",
          attributes: ["id", "firstname", "lastname", "avatar"],
        },
        {
          model: ReferralCommission,
          as: "referralEarnings",
          attributes: [],
          required: false,
          where: {
            status: {
              [Op.in]: ["approved", "paid"],
            },
          },
        },
      ],
      group: ["User.id", "referrer.id"], // ✅ مهم
      order: [[literal("total_paid"), "DESC"]],
      limit,
      offset,
      subQuery: false,
    });

    const total = await User.count({
      where: {
        referrer_id: {
          [Op.ne]: null, // 👈 null نباشه
        },
      },
    });

    this.response({
      res,
      data: {
        totalCount: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        items: usersRefral,
      },
    });
  }

  async typeChallenge(req, res) {
    const list = await ChallengeType.findAll();

    const newList = list?.map((e, i) => ({ value: e?.id, label: e?.name }));
    this.response({ res, data: newList });
  }
  async plansFind(req, res) {
    const list = await ChallengePlan.findAll({
      where: { challenge_type_id: req?.params?.type },
      attributes: ["id", "title", "balance"],
    });

    const newList = list?.map((e, i) => ({
      value: e?.id,
      label: e?.title,
      balance: e?.balance,
    }));
    this.response({ res, data: newList });
  }
};

module.exports = new Controller();
