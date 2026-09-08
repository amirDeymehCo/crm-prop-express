const { body } = require("express-validator");

module.exports = new (class {
  createTask() {
    return [
      body("title")
        .notEmpty()
        .withMessage("عنوان تسک الزامی است")
        .bail()
        .isLength({ min: 3 })
        .withMessage("عنوان باید حداقل ۳ کاراکتر باشد"),

      body("points")
        .notEmpty()
        .withMessage("امتیاز تسک الزامی است")
        .bail()
        .isInt({ min: 0 })
        .withMessage("امتیاز باید عدد صحیح و مثبت باشد"),

      body("category")
        .optional()
        .isIn(["social", "content", "certificate", "other"])
        .withMessage("دسته‌بندی تسک معتبر نیست"),

      body("verify_type")
        .optional()
        .isIn(["manual", "auto"])
        .withMessage("نوع بررسی معتبر نیست"),

      body("action_url")
        .optional({ nullable: true, checkFalsy: true })
        .isURL()
        .withMessage("لینک تسک معتبر نیست"),
    ];
  }

  saveTiers() {
    return [
      body("tiers")
        .isArray({ min: 1 })
        .withMessage("لیست پله‌های تخفیف الزامی است"),

      body("tiers.*.min_points")
        .isInt({ min: 0 })
        .withMessage("حداقل امتیاز هر پله باید عدد صحیح باشد"),

      body("tiers.*.discount_percent")
        .isFloat({ min: 0, max: 100 })
        .withMessage("درصد تخفیف باید بین ۰ تا ۱۰۰ باشد"),
    ];
  }
})();
