const { body } = require("express-validator");

module.exports = new (class {
  depositIRR() {
    return [
      body("amount_usd")
        .not().isEmpty().withMessage("مبلغ را وارد نمایید")
    ];
  }
  depositUSD() {
    return [
      body("amount_usd")
        .not().isEmpty().withMessage("مبلغ را وارد نمایید")
    ];
  }
})();
