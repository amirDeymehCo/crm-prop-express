const { body } = require("express-validator");

module.exports = new (class {
  depositIRR() {
    return [body("amount_usd").notEmpty().withMessage("مبلغ را وارد نمایید")];
  }
  depositUSD() {
    return [body("amount_usd").notEmpty().withMessage("مبلغ را وارد نمایید")];
  }
  widthdrawRequest() {
    return [
      body("amount_usd").notEmpty().withMessage("مبلغ را وارد نمایید"),

      body("wallet_address")
        .notEmpty()
        .withMessage("آدرس کیف پول را وارد نمایید")
        .custom((value) => {
          const isTRC20 = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
          const isBEP20 = /^0x[a-fA-F0-9]{40}$/.test(value);

          if (!isTRC20 && !isBEP20) {
            throw new Error("آدرس ولت معتبر نمی‌باشد (TRC20 یا BEP20 USDT).");
          }

          return true;
        }),
    ];
  }
})();
