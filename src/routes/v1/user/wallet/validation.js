const { body } = require("express-validator");

module.exports = new (class {
  depositIRR() {
    return [
      body("amount_usd")
        .notEmpty().withMessage("مبلغ را وارد نمایید")


    ];
  }
  depositUSD() {
    return [
      body("amount_usd")
        .notEmpty().withMessage("مبلغ را وارد نمایید")

    ];
  }
  widthdrawRequest() {
    return [
      body("amount_usd")
        .notEmpty().withMessage("مبلغ را وارد نمایید"),
      body("wallet_address")
        .notEmpty().withMessage("آدرس کیف پول را وارد نمایید")
        .matches(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
        .withMessage("آدرس ولت معتبر نمی‌باشد (TRC20 USDT)."),
    ];
  }
})();
