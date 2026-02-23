const { body } = require("express-validator");

module.exports = new (class {
  depositIRR() {
    return [
      body("amount_usd")
        .notEmpty().withMessage("مبلغ را وارد نمایید")


    ];
  }
})();
