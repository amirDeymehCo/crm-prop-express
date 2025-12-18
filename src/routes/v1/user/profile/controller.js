const Controllers = require("../../../controllers");
const User = require("../../../../models/User");

const Controller = class extends Controllers {
  async findProfile(req, res) {

    this.response({ res, data: req?.user, message: "اطلاعات کاربری" });
  }
};

module.exports = new Controller();
