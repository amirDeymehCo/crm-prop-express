const { body } = require("express-validator");

module.exports = new (class {
  createUser() {
    return [
      body("firstname")
        .isLength({ min: 3 })
        .withMessage("نام باید بشتر از 3 رقم باشد"),
      body("lastname")
        .isLength({ min: 3 })
        .withMessage("نام خانوادگی کاربری باید بشتر از 3 رقم باشد"),
      body("mobile")
        .isLength({ min: 11, max: 11 })
        .withMessage("شماره موبایل باید 11 رقم باشد")
        .matches(/^09\d{9}$/)
        .withMessage("شماره موبایل معتبر نیست"),
      body("email")
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage("فرمت ایمیل اشتباه است"),
      body("password")
        .isLength({ min: 3 })
        .withMessage("رمز عبور شما باید بشتر از 3 رقم باشد"),
    ];
  }

  changeTaskStatus() {
    return [
      body("user_id")
        .notEmpty()
        .withMessage("شناسه کاربر الزامی است")
        .bail()
        .isInt({ min: 1 })
        .withMessage("شناسه کاربر معتبر نیست"),

      body("status")
        .notEmpty()
        .withMessage("وضعیت الزامی است")
        .bail()
        .isIn(["approved", "rejected", "pending"])
        .withMessage("وضعیت ارسالی معتبر نیست"),

      body("task_id")
        .optional({ nullable: true, checkFalsy: true })
        .isInt({ min: 1 })
        .withMessage("شناسه تسک معتبر نیست"),

      body("submission_id")
        .optional({ nullable: true, checkFalsy: true })
        .isInt({ min: 1 })
        .withMessage("شناسه ثبت تسک معتبر نیست"),

      body("points")
        .optional({ nullable: true })
        .isInt({ min: 0 })
        .withMessage("امتیاز باید عدد صحیح و مثبت باشد"),

      body("admin_note")
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 1000 })
        .withMessage("یادداشت نباید بیشتر از ۱۰۰۰ کاراکتر باشد"),
    ];
  }
})();
