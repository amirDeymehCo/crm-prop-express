const Controllers = require("../../../controllers");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const founcList = require("../../../../utils/List");

const Controller = class extends Controllers {
  async createType(req, res) {
    const file = req?.file?.filename || null;
    if (!file)
      return this.response({
        res,
        status: 400,
        message: "ارسال لوگو اجباری است",
      });

    req.body.logo = file;
    await ChallengeType.create(req?.body);

    this.response({ res, status: 200, message: "چالش با موفقیت ساخته شد" });
  }
  async updateType(req, res) {
    const { id } = req.params;

    const type = await ChallengeType.findByPk(id);

    if (!type) {
      return this.response({
        res,
        status: 404,
        message: "نوع چالش یافت نشد",
      });
    }

    // اگر فایل جدید ارسال شده
    if (req.file?.filename) {
      req.body.logo = req.file.filename;
    }

    await type.update(req.body);

    return this.response({
      res,
      status: 200,
      message: "چالش با موفقیت ویرایش شد",
    });
  }

  async listTypes(req, res) {
    const listTypes = await founcList(ChallengeType, req, {});

    this.response({ res, data: listTypes });
  }
  async findType(req, res) {
    const singleType = await ChallengeType.findByPk(req?.params?.id);

    this.response({ res, data: singleType });
  }
  async createPlan(req, res) {
    const newPlan = await ChallengePlan.create(req?.body);

    this.response({ res, status: 201, message: "پلن با موفقیت اضافه شد" });
  }
  async plans(req, res) {
    const plans = await founcList(
      ChallengePlan,
      req,
      {
        challenge_type_id: req?.params?.type_id,
      },
      {
        include: [ChallengeType],
        attributes: [
          "id",
          "title",
          "price_usd",
          "has_floating_risk",
          "allow_insurance",
          "is_active",
          "createdAt",
        ],
      },
    );

    this.response({ res, data: plans });
  }

  async findPlan(req, res) {
    const findPlan = await ChallengePlan.findByPk(req?.params?.id, {
      include: [ChallengeType],
    });

    if (!findPlan)
      return this.response({ res, status: 400, message: "پلن پیدا نشد" });

    this.response({ res, data: findPlan });
  }
  async updatePlan(req, res) {
    await ChallengePlan.update(req?.body, {
      where: { id: req?.params?.id },
    });

    this.response({ res, status: 201, message: "پلن با موفقیت ویرایش شد" });
  }
  async deleteType(req, res) {
    const chDeleted = await ChallengeType.destroy({
      where: { id: req?.params?.id },
    });

    if (!chDeleted)
      return this.response({ res, status: 400, message: "نوع چالش یافت نشد" });

    await ChallengePlan.destroy({
      where: { challenge_type_id: req?.params?.id },
    });

    this.response({
      res,
      status: 200,
      message: "چالش و تمام پلن های اون حذف شدن",
    });
  }
  async deletePlan(req, res) {
    await ChallengePlan.destroy({
      where: { id: req?.params?.id },
    });

    this.response({
      res,
      status: 200,
      message: "پلن حذف شد",
    });
  }
};

module.exports = new Controller();
