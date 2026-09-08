const { body } = require("express-validator");

module.exports = new (class {
  submit() {
    return [
      body("task_id")
        .notEmpty()
        .withMessage("شناسه تسک الزامی است")
        .bail()
        .isInt({ min: 1 })
        .withMessage("شناسه تسک معتبر نیست"),

      body("note")
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 1000 })
        .withMessage("توضیحات نباید بیشتر از ۱۰۰۰ کاراکتر باشد"),
    ];
  }
})();
