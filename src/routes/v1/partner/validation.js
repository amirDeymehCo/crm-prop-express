const { body, param, query } = require("express-validator");

const { MAX_LOOKUP_LOGINS } = require("../../../services/Recovery/constants");

const validation = {
  lookupAccounts: () => [
    body("mt_logins")
      .isArray({ min: 1, max: MAX_LOOKUP_LOGINS })
      .withMessage(
        `mt_logins باید آرایه‌ای بین ۱ تا ${MAX_LOOKUP_LOGINS} عضو باشد`,
      ),
    body("mt_logins.*")
      .custom((v) => v !== null && v !== undefined && String(v).trim() !== "")
      .withMessage("هر mt_login باید مقدار داشته باشد"),
  ],

  createOffer: () => [
    body("mt_login")
      .notEmpty()
      .withMessage("mt_login اجباری است"),
    body("offer_price_usd")
      .isFloat({ gt: 0 })
      .withMessage("offer_price_usd باید عددی بزرگ‌تر از صفر باشد"),
    body("payment_plan")
      .optional({ nullable: true })
      .isIn(["full", "installment"])
      .withMessage("payment_plan فقط full یا installment"),
    body("expires_at")
      .optional({ nullable: true })
      .isISO8601()
      .withMessage("expires_at باید تاریخ ISO باشد"),
    body("external_ref").optional({ nullable: true }).isLength({ max: 191 }),
    body("agent").optional({ nullable: true }).isLength({ max: 191 }),
    body("note").optional({ nullable: true }).isLength({ max: 2000 }),
  ],

  offerRef: () => [
    param("id").optional().isInt({ min: 1 }).withMessage("id نامعتبر است"),
    query("external_ref").optional().isLength({ max: 191 }),
  ],

  cancelOffer: () => [
    param("id").isInt({ min: 1 }).withMessage("id نامعتبر است"),
    body("reason").optional({ nullable: true }).isLength({ max: 500 }),
  ],
};

module.exports = validation;
