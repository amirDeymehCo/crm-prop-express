const Controllers = require("../../../controllers");
const ReferralCommission = require("../../../../models/ReferralCommission");
const ReferralCommissionRule = require("../../../../models/ReferralCommissionRule");
const User = require("../../../../models/User");
const sequelize = require("../../../../../db");
const founcList = require("../../../../utils/List");
const avatars = require("../../../../configs/avatars");
const bcrypt = require("bcrypt");

const Controller = class extends Controllers {
  async findProfile(req, res) {
    this.response({ res, data: req?.user, message: "اطلاعات کاربری" });
  }
  async refralStates(req, res) {
    const referrerId = req?.user?.id;

    const rows = await ReferralCommission.findAll({
      where: { referrer_id: referrerId, status: ["approved", "paid"] },
      attributes: [
        [
          sequelize.fn("SUM", sequelize.col("order_amount")),
          "total_orders_amount",
        ],
        [
          sequelize.fn("SUM", sequelize.col("commission_amount")),
          "total_commission_amount",
        ],
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
      res,
      message: "وضعیت رفرال شما",
      data: {
        totalOrdersAmount: Number(stats.total_orders_amount || 0),
        totalCommissionAmount: Number(stats.total_commission_amount || 0),
        totalReferrals,
        commissionPercent,
      },
    });
  }
  async refralList(req, res) {
    const usersRefral = await founcList(
      ReferralCommission,
      req,
      {
        user_id: req?.user?.id, // ✅ فقط رفرال‌های این کاربر
      },
      {
        attributes: [
          "referred_user_id",

          // مجموع مبلغ سفارش‌ها
          [sequelize.fn("SUM", sequelize.col("order_amount")), "total_paid"],

          // مجموع کمیسیون
          [
            sequelize.fn("SUM", sequelize.col("commission_amount")),
            "total_commission",
          ],
        ],
        include: [
          {
            model: User,
            as: "referredUser",
            attributes: ["id", "firstname", "lastname", "avatar", "createdAt"],
          },
        ],
        group: ["referred_user_id", "referredUser.id"],
        order: [[sequelize.literal("total_paid"), "DESC"]],
      },
    );

    this.response({
      res,
      status: 200,
      message: "لیست کاربران رفرال شما",
      data: usersRefral,
    });
  }

  async updatedProfile(req, res) {
    const newData = {};
    if (req?.body?.firstname) newData.firstname = req?.body?.firstname;
    if (req?.body?.lastname) newData.lastname = req?.body?.lastname;

    await User.update(newData, { where: { id: req?.user?.id } });

    this.response({
      res,
      message: "کاربر مای پراپ، اطلاعات پروفایل شما آپدیت شد.",
    });
  }
  async changeAvatar(req, res) {
    const file = req?.file?.filename || null;
    await User.update({ avatar: file }, { where: { id: req?.user?.id } });

    this.response({
      res,
      message: "کاربر مای پراپ، آواتار شما با موفقیت تغییر کرد",
    });
  }
  async avatarsList(req, res) {
    this.response({ res, message: "لیست آواتار های آماده ما", data: avatars });
  }
  async selectAvatar(req, res) {
    const avatarSelect = Number(req?.body?.avatarSelect);

    if (!Number.isInteger(avatarSelect)) {
      return this.response({
        res,
        message: "شناسه ارسالی نامعتبر است",
        status: 400,
      });
    }

    if (avatarSelect < 1 || avatarSelect > avatars.length) {
      return this.response({
        res,
        message: "شناسه ارسالی اشتباه است",
        status: 400,
      });
    }

    const url = avatars[avatarSelect - 1];

    await User.update({ avatar: url }, { where: { id: req?.user?.id } });

    return this.response({
      res,
      status: 200,
      data: { avatarSelect, avatar: url },
    });
  }
  async changePassword(req, res) {
    const userId = req?.user?.id;
    const { currentPassword, newPassword, repeadPassword } = req.body;

    // 1️⃣ validate inputs
    if (!currentPassword || !newPassword) {
      return this.response({
        res,
        status: 400,
        message: "رمز عبور فعلی و رمز جدید الزامی است",
      });
    }

    if (newPassword !== repeadPassword) {
      return this.response({
        res,
        status: 400,
        message: "تکرار رمز عبور با رمز عبور جدید یکی نیست",
      });
    }

    if (newPassword.length < 6) {
      return this.response({
        res,
        status: 400,
        message: "رمز جدید باید حداقل ۸ کاراکتر باشد",
      });
    }

    // 2️⃣ get user
    const user = await User.findByPk(userId, {
      attributes: ["id", "password"],
    });

    if (!user) {
      return this.response({
        res,
        status: 404,
        message: "کاربر یافت نشد",
      });
    }

    // 3️⃣ compare current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isValidPassword) {
      return this.response({
        res,
        status: 400,
        message: "رمز عبور فعلی اشتباه است",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(newPassword, salt);

    // 5️⃣ update only password field (important)
    await User.update({ password: hashPassword }, { where: { id: userId } });

    return this.response({
      res,
      status: 200,
      message: "رمز عبور با موفقیت تغییر یافت",
    });
  }
};

module.exports = new Controller();
