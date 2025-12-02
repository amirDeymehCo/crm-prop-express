const { body } = require("express-validator");


const ALLOWED_GATEWAYS = ["peykan", "nowpayments"]; // هرچی خودت داری جایگزین کن


module.exports = new (class {
  buyChallenge() {
    return [
      body("challenge_plan_id")
        .notEmpty().withMessage("شناسه پلن چالش الزامی است")
        .bail()
        .isInt({ min: 1 }).withMessage("شناسه پلن چالش معتبر نیست"),

      body("gateway")
        .notEmpty().withMessage("انتخاب درگاه پرداخت الزامی است")
        .bail()
        .isString().withMessage("فرمت درگاه پرداخت معتبر نیست")
        .bail()
        .custom((value) => {
          if (!ALLOWED_GATEWAYS.includes(value)) {
            throw new Error("درگاه پرداخت انتخاب‌شده نامعتبر است");
          }
          return true;
        }),

      body("with_insurance")
        .optional()
        .isBoolean().withMessage("فیلد with_insurance باید بولین باشد")
        .bail()
        .toBoolean(),

      body("coupon_code")
        .optional({ checkFalsy: true })
        .isString().withMessage("کد تخفیف باید متن باشد")
        .bail()
        .trim()
        .isLength({ min: 3, max: 50 }).withMessage("کد تخفیف باید حداقل ۳ کاراکتر باشد"),
    ];
  }
})();
