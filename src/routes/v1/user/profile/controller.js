const Controllers = require("../../../controllers");
const User = require("../../../../models/User");

const Controller = class extends Controllers {
  async updateProfile(req, res) {
    const updatePro = await User.update(req?.body, { where: { id: req?.user?.id } })

    this.response({ res, status: 200, message: "پروفایل کاربری آپدیت شد" })
  }
};

module.exports = new Controller();
