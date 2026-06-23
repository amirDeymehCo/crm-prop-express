const Controllers = require("../../../controllers");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengePhase = require("../../../../models/Challenge/ChallengePhase");
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
    const newPlan = await ChallengePlan.create({ ...req?.body, price_irr: 0 });

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
  async phaseList(req, res) {
    const listPhase = await founcList(
      ChallengePhase,
      req,
      {
        challenge_plan_id: req?.params?.plan_id,
      },
      {
        attributes: ["id", "name", "phase_index", "createdAt"],
        include: [
          {
            model: ChallengePlan,
            attributes: ["id", "title", "balance"],
            include: [
              {
                model: ChallengeType,
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      },
    );

    this.response({ res, status: 200, data: listPhase });
  }
  async deletePhase(req, res) {
    const chDeleted = await ChallengePhase.destroy({
      where: { id: req?.params?.phase_id },
    });

    if (!chDeleted)
      return this.response({ res, status: 400, message: "مرحله یافت نشد" });

    this.response({
      res,
      status: 200,
      message: "مرحله با موفقیت حذف شد",
    });
  }
  async findPhase(req, res) {
    const findPh = await ChallengePhase.findByPk(req?.params?.id);

    this.response({ res, status: 200, data: findPh });
  }
  async createPhase(req, res) {
    const findPh = await ChallengePhase.findOne({
      where: {
        phase_index: req?.body?.phase_index,
        challenge_plan_id: req?.body?.challenge_plan_id,
      },
    });

    if (findPh)
      return this.response({
        res,
        status: 400,
        message: "قبلا برای این پلن مرحله ای با ایین شماره ساخته شده است",
      });

    const newPhase = await ChallengePhase.create(req?.body);

    if (!newPhase)
      return this.response({ res, status: 400, message: "مرحله ساخته نشد" });

    this.response({
      res,
      status: 201,
      message: "مرحله با موفقیت ساخته شد",
    });
  }
};

module.exports = new Controller();
