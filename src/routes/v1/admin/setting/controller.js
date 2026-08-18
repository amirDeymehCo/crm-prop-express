const Controllers = require("../../../controllers");
const Setting = require("../../../../models/Setting");

const Controller = class extends Controllers {
  async updateSetting(req, res) {
    await Setting.update(req?.body, { where: { id: 1 } });

    this.response({ res, message: "تنظیمات با موفقیت ویرایش شد" });
  }
  async findSetting(req, res) {
    const setting = await Setting.findByPk(1);

    this.response({ res, data: setting, message: "اطلاعات تنظیمات" });
  }
};

module.exports = new Controller();
