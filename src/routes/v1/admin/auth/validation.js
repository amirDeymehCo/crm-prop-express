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
})();
