const { STATUS_USER_CHALLENGE } = require("../../../../utils/statusList");
const { body } = require("express-validator");



module.exports = new (class {
  changeStatus() {
    return [
      body("new_status")
        .notEmpty().withMessage("انتخاب درگاه پرداخت الزامی است")
        .bail()
        .isString().withMessage("فرمت درگاه پرداخت معتبر نیست")
        .bail()
        .custom((value) => {
          if (!STATUS_USER_CHALLENGE.includes(value)) {
            throw new Error("درگاه پرداخت انتخاب‌شده نامعتبر است");
          }
          return true;
        }),
    ];
  }

})();
