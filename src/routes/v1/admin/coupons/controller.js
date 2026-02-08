const Controllers = require("../../../controllers");
const Coupon = require("../../../../models/Coupon");
const CouponUsage = require("../../../../models/CouponUsage");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const User = require("../../../../models/User");
const founcList = require("../../../../utils/List");

const Controller = class extends Controllers {
  async list(req, res) {
    const where = {};

    if (req?.query?.user_id) where.user_id = req.query.user_id;
    if (req?.query?.is_active) where.is_active = req.query.is_active;

    const coupons = await founcList(
      Coupon,
      req,
      where, // ✅ اینجا درست شد
      {
        include: [
          {
            model: ChallengeType,
            as: "challengeType",
          },
          {
            model: ChallengePlan,
            as: "challengePlan",
            attributes: ["id", "balance"],
          },
        ],
      },
    );

    this.response({ res, data: coupons });
  }
  async single(req, res) {
    const singleCoupon = await Coupon.findByPk(req?.params?.id, {
      include: [
        {
          model: ChallengeType,
          as: "challengeType",
        },
        {
          model: ChallengePlan,
          as: "challengePlan",
          attributes: ["id", "balance"],
        },
      ],
    });
    if (!singleCoupon)
      return this.response({
        res,
        status: 400,
        message: "شناسه کد تخفیف اشتباه است",
      });

    this.response({ res, status: 200, data: singleCoupon });
  }
  async create(req, res) {
    const {
      title,
      code,
      type,
      value,
      max_uses,
      max_uses_per_user,
      valid_from,
      valid_to,
      min_order_amount_usd,
      challenge_type_id,
      challenge_plan_id,
      is_active,
      user_id,
    } = req.body;

    /* =====================
     Validation
     ===================== */
    if (!title || !code || !type || !value) {
      return this.response({
        res,
        status: 400,
        message: "title, code, type و value الزامی هستند",
      });
    }

    if (!["percent", "fixed"].includes(type)) {
      return this.response({
        res,
        status: 400,
        message: "type باید percent یا fixed باشد",
      });
    }

    if (type === "percent" && value > 100) {
      return this.response({
        res,
        status: 400,
        message: "مقدار تخفیف درصدی نمی‌تواند بیشتر از 100 باشد",
      });
    }

    if (value <= 0) {
      return this.response({
        res,
        status: 400,
        message: "مقدار تخفیف باید بزرگتر از صفر باشد",
      });
    }

    /* =====================
     Check duplicate code
     ===================== */
    const existingCoupon = await Coupon.findOne({
      where: { code },
    });

    if (existingCoupon) {
      return this.response({
        res,
        status: 409,
        message: "این کد تخفیف قبلاً ثبت شده است",
      });
    }

    /* =====================
     Create coupon
     ===================== */
    const coupon = await Coupon.create({
      title,
      code: code.toLowerCase(), // استاندارد
      type,
      value,
      max_uses: max_uses ?? null,
      max_uses_per_user: max_uses_per_user ?? null,
      valid_from: valid_from ?? null,
      valid_to: valid_to ?? null,
      min_order_amount_usd: min_order_amount_usd ?? null,
      challenge_type_id: challenge_type_id ?? null,
      challenge_plan_id: challenge_plan_id ?? null,
      is_active: is_active ?? true,
      user_id: user_id ?? null,
    });

    return this.response({
      res,
      status: 201,
      message: "کد تخفیف با موفقیت ایجاد شد",
      data: coupon,
    });
  }
  async update(req, res) {
    const { id } = req.params;

    const {
      title,
      code,
      type,
      value,
      max_uses,
      max_uses_per_user,
      valid_from,
      valid_to,
      min_order_amount_usd,
      challenge_type_id,
      challenge_plan_id,
      is_active,
      user_id,
    } = req.body;

    /* =====================
     Find coupon
     ===================== */
    const coupon = await Coupon.findByPk(id);

    if (!coupon) {
      return this.response({
        res,
        status: 404,
        message: "کد تخفیف مورد نظر یافت نشد",
      });
    }

    /* =====================
     Validation (only if provided)
     ===================== */
    if (type && !["percent", "fixed"].includes(type)) {
      return this.response({
        res,
        status: 400,
        message: "type باید percent یا fixed باشد",
      });
    }

    if (value !== undefined) {
      if (value <= 0) {
        return this.response({
          res,
          status: 400,
          message: "مقدار تخفیف باید بزرگتر از صفر باشد",
        });
      }

      const finalType = type ?? coupon.type;

      if (finalType === "percent" && value > 100) {
        return this.response({
          res,
          status: 400,
          message: "مقدار تخفیف درصدی نمی‌تواند بیشتر از 100 باشد",
        });
      }
    }

    /* =====================
     Check duplicate code
     ===================== */
    if (code && code.toLowerCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({
        where: { code: code.toLowerCase() },
      });

      if (existingCoupon) {
        return this.response({
          res,
          status: 409,
          message: "این کد تخفیف قبلاً ثبت شده است",
        });
      }
    }

    /* =====================
     Update coupon
     ===================== */
    await coupon.update({
      title: title ?? coupon.title,
      code: code ? code.toLowerCase() : coupon.code,
      type: type ?? coupon.type,
      value: value ?? coupon.value,
      max_uses: max_uses ?? coupon.max_uses,
      max_uses_per_user: max_uses_per_user ?? coupon.max_uses_per_user,
      valid_from: valid_from ?? coupon.valid_from,
      valid_to: valid_to ?? coupon.valid_to,
      min_order_amount_usd: min_order_amount_usd ?? coupon.min_order_amount_usd,
      challenge_type_id: challenge_type_id ?? coupon.challenge_type_id,
      challenge_plan_id: challenge_plan_id ?? coupon.challenge_plan_id,
      is_active: is_active ?? coupon.is_active,
      user_id: user_id ?? coupon?.user_id,
    });

    return this.response({
      res,
      status: 200,
      message: "کد تخفیف با موفقیت ویرایش شد",
      data: coupon,
    });
  }
};

module.exports = new Controller();
