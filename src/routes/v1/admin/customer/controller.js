const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const UserChallenge = require("../../../../models/UserChallenge");
const PermissionGroup = require("../../../../models/PermissionGroup");
const Permission = require("../../../../models/Permission");

const Controller = class extends Controllers {
  async getData(req, res) {
    const { mobile } = req?.body;
    const findUser = await User.findOne({ where: { mobile } })
    if (!findUser) return this.response({ res, status: 400, message: "کاربری با این شماره تلفن یافت نشد" })
    const userChallenge = await UserChallenge.findAll({ where: { user_id: findUser?.id } });


    this.response({ res, status: 200, message: "پروفایل کاربری آپدیت شد" })
  }
};

module.exports = new Controller();
