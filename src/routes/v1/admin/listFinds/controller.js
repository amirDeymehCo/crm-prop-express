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
    const whare = {};
    if (req?.query?.referrer_id) whare.referrer_id = req?.query?.referrer_id;

    const usersRefral = await founcList(ReferralCommission, req, whare, {
      attributes: [
        "referred_user_id",
        [sequelize.fn("SUM", sequelize.col("order_amount")), "total_paid"],
        [
          sequelize.fn("SUM", sequelize.col("commission_amount")),
          "total_commission",
        ],
        "id",
        "createdAt",
      ],
      include: [
        {
          model: User,
          as: "referredUser",
          attributes: {
            exclude: ["password", "responsible_admin_id", "mobile", "email"],
          },
        },
        {
          model: User,
          as: "referrer", // 👈 اضافه شده
          attributes: ["id", "firstname", "lastname", "avatar"], // یا هر چیزی که نیاز داری
        },
      ],
      group: ["referred_user_id", "referredUser.id", "referrer.id"],
      order: [[sequelize.literal("total_paid"), "DESC"]],
    });

    this.response({ res, data: usersRefral });
  }
};

module.exports = new Controller();
