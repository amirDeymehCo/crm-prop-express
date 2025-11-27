const autoBind = require("auto-bind");
const { validationResult } = require("express-validator");

module.exports = class {
  constructor() {
    autoBind(this);
  }

  validationBody(req, res, next) {
    const result = validationResult(req);

    if (!result.isEmpty()) {
      const arrayErrors = result.array();
      const errors = arrayErrors.map((e) => e.msg);

      res.status(400).json({
        message: errors,
        data: null,
      });

      return false;
    }

    next();
    return true;
  }

  response({ res, message = "", data = null, status = 200 }) {
    res.status(status).json({
      message,
      data,
    });
  }
  checkImage({ res, name = " عکس " }) {
    res.status(400).json({
      message: `ارسال ${name} اجباری است`,
    });
  }
};
