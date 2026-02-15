const { body } = require("express-validator");

module.exports = new (class {
  createWitdrawCart() {
    return [
      body("total_profit")
        .not()
        .isEmpty()
        .withMessage("مقدار سود کلی باید وارد شود"),
      body("withdraw_profit")
        .not()
        .isEmpty()
        .withMessage("مقدار سود تقسیمی باید وارد شود"),
    ];
  }
})();
