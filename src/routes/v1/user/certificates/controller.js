const Controllers = require("../../../controllers");
const Certificates = require("../../../../models/Certificates");

const Controller = class extends Controllers {
  async list(req, res) {
    const listCarts = await Certificates.findAll({
      where: { user_id: req?.user?.id },
    });

    this.response({ res, status: 200, data: listCarts });
  }
};

module.exports = new Controller();
