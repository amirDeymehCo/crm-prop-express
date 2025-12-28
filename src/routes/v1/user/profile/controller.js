const Controllers = require("../../../controllers");
const ReferralCommission = require("../../../../models/ReferralCommission");
const ReferralCommissionRule = require("../../../../models/ReferralCommissionRule");
const User = require("../../../../models/User");
const sequelize = require("../../../../../db");
const founcList = require("../../../../utils/List");

const Controller = class extends Controllers {
  async findProfile(req, res) {

    this.response({ res, data: req?.user, message: "اطلاعات کاربری" });
  }
  async refralStates(req, res) {
    const referrerId = req?.user?.id

    const rows = await ReferralCommission.findAll({
      where: { referrer_id: referrerId, status: ["approved", "paid"] },
      attributes: [
        [sequelize.fn("SUM", sequelize.col("order_amount")), "total_orders_amount"],
        [sequelize.fn("SUM", sequelize.col("commission_amount")), "total_commission_amount"],
      ],
      raw: true,
    });

    const stats = rows[0];

    // refrals user 
    const totalReferrals = await User.count({
      where: { referrer_id: referrerId },
    });


    // comission user 
    let commissionRule = await ReferralCommissionRule.findOne({
      where: {
        referrer_id: referrerId,
        referred_user_id: null,
      },
      attributes: ["percent"],
    });

    if (!commissionRule) {
      commissionRule = await ReferralCommissionRule.findOne({
        where: {
          referrer_id: null,
          referred_user_id: null,
        },
        attributes: ["percent"],
      });
    }

    const commissionPercent = Number(commissionRule?.percent ?? 7);



    this.response({
      res, message: "وضعیت رفرال شما", data: {
        totalOrdersAmount: Number(stats.total_orders_amount || 0),
        totalCommissionAmount: Number(stats.total_commission_amount || 0),
        totalReferrals,
        commissionPercent
      }
    })
  }
  async refralList(req, res) {
    const usersRefral = await founcList(ReferralCommission, req, {}, {
      attributes: [
        "referred_user_id",
        [sequelize.fn("SUM", sequelize.col("order_amount")), "total_paid"],
        [sequelize.fn("SUM", sequelize.col("commission_amount")), "total_commission"],
        "id", "createdAt"
      ],
      include: [
        {
          model: User,
          as: "referredUser",
          attributes: { exclude: ["password", "responsible_admin_id", "mobile", "email"] },
        },
      ],
      group: ["referred_user_id", "referredUser.id"],
      order: [[sequelize.literal("total_paid"), "DESC"]],
    })



    this.response({ res, status: 200, message: "لیست کاربران رفرال شما", data: usersRefral })
  }
};

module.exports = new Controller();
