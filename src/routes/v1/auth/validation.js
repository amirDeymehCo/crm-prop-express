const { body } = require("express-validator");

module.exports = new (class {
  register() {
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
  loginPassword() {
    return [
      body("mobile")
        .isLength({ min: 11, max: 11 })
        .withMessage("شماره موبایل باید 11 رقم باشد")
        .matches(/^09\d{9}$/)
        .withMessage("شماره موبایل معتبر نیست"),
      body("password")
        .isLength({ min: 3 })
        .withMessage("رمز عبور شما باید بشتر از 3 رقم باشد"),
    ];
  }
  loginCode() {
    return [
      body("mobile")
        .isLength({ min: 11, max: 11 })
        .withMessage("شماره موبایل باید 11 رقم باشد")
        .matches(/^09\d{9}$/)
        .withMessage("شماره موبایل معتبر نیست"),

    ];
  }
  forgotPassword() {
    return [
      body("mobile")
        .isLength({ min: 11, max: 11 })
        .withMessage("شماره موبایل باید 11 رقم باشد")
        .matches(/^09\d{9}$/)
        .withMessage("شماره موبایل معتبر نیست"),

    ];
  }
  verifyOtp() {
    return [
      body("mobile")
        .isLength({ min: 11, max: 11 })
        .withMessage("شماره موبایل باید 11 رقم باشد")
        .matches(/^09\d{9}$/)
        .withMessage("شماره موبایل معتبر نیست"),

      body("code")
        .isLength({ min: 4, max: 4 })
        .withMessage("کد تایید باید 4 رقم باشد"),
    ];
  }
  changePassword() {
    return [
      body("mobile")
        .isLength({ min: 11, max: 11 })
        .withMessage("شماره موبایل باید 11 رقم باشد")
        .matches(/^09\d{9}$/)
        .withMessage("شماره موبایل معتبر نیست"),

      body("code")
        .isLength({ min: 4, max: 4 })
        .withMessage("کد تایید باید 4 رقم باشد"),
      body("password")
        .isLength({ min: 3 })
        .withMessage("رمز عبور شما باید بشتر از 3 رقم باشد"),
    ];
  }
})();
