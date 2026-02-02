const { body } = require("express-validator");

module.exports = new (class {
  create() {
    return [
      body("title")
        .isLength({ min: 3 })
        .withMessage("عنوان باید بیشتر از 3 کاراکتر باشد"),
      body("departeman")
        .isIn(["technical", "liveAccount", "challenges"])
        .withMessage("مقدار دپارتمان نامعتبر هست"),
      body("priority")
        .isIn(["low", "medium", "hight"])
        .withMessage("مقدار اولویت نامعتبر هست"),
      body("message")
        .isLength({ min: 3 })
        .withMessage("متن پیام باید بیشتر از 3 رقم باشد"),
    ];
  }
  sendMessage() {
    return [
      body("message")
        .isLength({ min: 3 })
        .withMessage("پیام شما باید بیشتر از 3 رقم باشد"),
    ];
  }
  widthdrawRequest() {
    return [
      body("amount_usd").notEmpty().withMessage("مبلغ را وارد نمایید"),
      body("wallet_address")
        .notEmpty()
        .withMessage("آدرس کیف پول را وارد نمایید")
        .matches(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
        .withMessage("آدرس ولت معتبر نمی‌باشد (TRC20 USDT)."),
    ];
  }
})();
