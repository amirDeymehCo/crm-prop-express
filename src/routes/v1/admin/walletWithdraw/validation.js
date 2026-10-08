const { body } = require("express-validator");

module.exports = new (class {
  create() {
    return [
      body("title")
        .isLength({ min: 3 })
        .withMessage("عنوان باید بیشتر از 3 کاراکتر باشد"),
      body("departeman")
        .isIn([
          "technical",
          "liveAccount",
          "challenges",
          "request_widthdraw",
          "real_account",
          "kyc",
        ])
        .withMessage("مقدار دپارتمان نامعتبر هست"),
      body("priority")
        .isIn(["low", "medium", "hight"])
        .withMessage("مقدار اولویت نامعتبر هست"),
      body("message")
        .isLength({ min: 3 })
        .withMessage("متن پیام باید بیشتر از 3 رقم باشد"),
    ];
  }
  update() {
    return [
      body("title")
        .isLength({ min: 3 })
        .withMessage("عنوان باید بیشتر از 3 کاراکتر باشد"),
      body("departeman")
        .isIn([
          "technical",
          "liveAccount",
          "challenges",
          "request_widthdraw",
          "real_account",
          "kyc",
        ])
        .withMessage("مقدار دپارتمان نامعتبر هست"),
      body("priority")
        .isIn(["low", "medium", "hight"])
        .withMessage("مقدار اولویت نامعتبر هست"),
    ];
  }
  updateReqeust() {
    return [
      body("id").notEmpty().withMessage("شناسه درخواست برداشت را وارد کنید"),
      body("status")
        .isIn([
          "waiting",
          "verify",
          "canceled",
          "reuqest_waiting",
          "request_prograssing",
          "request_pending_paid",
          "request_paid",
          "request_canceled",
        ])
        .withMessage("وضعیت درخواست برداشت نامعتبر است"),
      body("admin_note")
        .optional({ values: "falsy" })
        .isLength({ max: 1000 })
        .withMessage("توضیحات ادمین حداکثر ۱۰۰۰ کاراکتر است"),
      body("payment_reference")
        .optional({ values: "falsy" })
        .isLength({ max: 191 })
        .withMessage("شماره پیگیری واریز حداکثر ۱۹۱ کاراکتر است"),
    ];
  }
  sendMessage() {
    return [
      body("message")
        .isLength({ min: 3 })
        .withMessage("پیام شما باید بیشتر از 3 رقم باشد"),
    ];
  }
})();
