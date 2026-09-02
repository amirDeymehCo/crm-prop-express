const { body } = require("express-validator");

module.exports = new (class {
  createRecord() {
    return [
      body("amount_usd").not().isEmpty().withMessage("مقدار باید وارد شود"),
    ];
  }
})();
