const { body } = require("express-validator");

module.exports = new (class {
  createCall() {
    return [
      body("description")
        .isLength({ min: 3 })
        .withMessage("توضیحات باید بیشتر از 3 کاراکتر باشد"),
      body("is_answer")
        .isBoolean()
        .withMessage("مقدار کاربر پاسخ داده است باید ارسال شود"),
      body("how_find")
        .isIn(["EMAIL",
          "SMS",
          "TELEGRAM",
          "INSTAGRAM",
          "WHATSAPP",
          "FREANDS",
          "GOOGLE"])
        .withMessage("مقدار چطور با ما اشنا شدید نامعتبر است"),
      body("category")
        .isIn(["NEW_USER",
          "CANCELED",
          "FREE_CHALLENGE",
          "NOT_PASSED",
          "WAIT_PAYEMNT_FREE_CAHLLENGE",
          "WAIT_PEYAMNT",
          "BIME_CHALLENGE",
          "PHONES_BUY",
          "PHONES_NOT_BUY",])
        .withMessage("مقدار دسته بندی کاربر نا معتبر است"),
      body("time")
        .not().isEmpty()
        .withMessage("مقدار زمان باید ارسال شود"),
      body("direction")
        .isIn(["outbound",
          "inbound",])
        .withMessage("مقدار نوع تماس نا معتبر است"),
      body("user_id").not().isEmpty().withMessage("user_id باید ارسال شود")
    ];
  }
  createSms() {
    return [
      body("text")
        .isLength({ min: 3 })
        .withMessage("توضیحات باید بیشتر از 3 کاراکتر باشد"),
      body("user_id").not().isEmpty().withMessage("user_id باید ارسال شود")
    ];
  }
})();
