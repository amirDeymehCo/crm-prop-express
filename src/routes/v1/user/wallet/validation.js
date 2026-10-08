const { body } = require("express-validator");
const { isValidSheba, normalizeSheba } = require("../../../../utils/sheba");

// متدهای مجاز برداشت. اگر method ارسال نشود، برای سازگاری با نسخه‌های قبلی
// فرانت، crypto در نظر گرفته می‌شود.
const WITHDRAW_METHODS = ["crypto", "irr"];

const resolveMethod = (req) => {
  const method = String(req?.body?.method || "crypto").trim();

  return WITHDRAW_METHODS.includes(method) ? method : "crypto";
};

module.exports = new (class {
  depositIRR() {
    return [body("amount_usd").notEmpty().withMessage("مبلغ را وارد نمایید")];
  }
  depositUSD() {
    return [body("amount_usd").notEmpty().withMessage("مبلغ را وارد نمایید")];
  }
  widthdrawRequest() {
    return [
      body("method")
        .optional()
        .isIn(WITHDRAW_METHODS)
        .withMessage("روش برداشت نامعتبر است"),

      // مبلغ در هر دو روش دلاری است (مثلاً 5 یعنی ۵ دلار)
      body("amount_usd")
        .notEmpty()
        .withMessage("مبلغ را وارد نمایید")
        .bail()
        .custom((value) => {
          if (!(Number(value) > 0)) {
            throw new Error("مبلغ باید بزرگ‌تر از صفر باشد");
          }

          return true;
        }),

      body("wallet_address")
        .if((value, { req }) => resolveMethod(req) === "crypto")
        .notEmpty()
        .withMessage("آدرس کیف پول را وارد نمایید")
        .bail()
        .custom((value) => {
          const isTRC20 = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
          const isBEP20 = /^0x[a-fA-F0-9]{40}$/.test(value);

          if (!isTRC20 && !isBEP20) {
            throw new Error("آدرس ولت معتبر نمی‌باشد (TRC20 یا BEP20 USDT).");
          }

          return true;
        }),

      body("sheba")
        .if((value, { req }) => resolveMethod(req) === "irr")
        .notEmpty()
        .withMessage("شماره شبا را وارد نمایید")
        .bail()
        .custom((value) => {
          if (!isValidSheba(value)) {
            throw new Error(
              "شماره شبا معتبر نیست (IR و ۲۴ رقم، با رقم کنترلی صحیح)",
            );
          }

          return true;
        })
        .customSanitizer((value) => normalizeSheba(value)),

      body("account_holder")
        .if((value, { req }) => resolveMethod(req) === "irr")
        .optional({ values: "falsy" })
        .isLength({ min: 3 })
        .withMessage("نام صاحب حساب باید بیشتر از ۳ کاراکتر باشد"),
    ];
  }
})();
