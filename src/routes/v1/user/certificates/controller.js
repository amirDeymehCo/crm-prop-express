const Certificates = require("../../../../models/Certificates");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const createPhaseCertificate = require("../../../../utils/CreateCt");
const Controllers = require("../../controllers");
const { Op } = require("sequelize");

const Controller = class extends Controllers {
  async list(req, res) {
    const listCarts = await Certificates.findAll({
      where: { user_id: req?.user?.id },
    });

    this.response({ res, status: 200, data: listCarts });
  }
  async create(req, res) {
    const chFind = await UserChallenge?.findOne({
      where: { id: req?.body?.user_challenge_id, user_id: req?.user?.id },
    });

    if (!chFind)
      return this.response({
        res,
        status: 400,
        message: "چالش مورد نظر برای این کاربر یافت نشد",
      });

    const findCert = await Certificates.findOne({
      where: {
        user_id: req?.user?.id,
        userChallengeId: chFind?.id,
        type: `steep${req?.body?.phase_index}`,
      },
    });

    if (findCert)
      return this.response({
        res,
        status: 400,
        message:
          "کاربر مای پراپ، شما قبلا برای این مرحله چالش گواهینامه ساخته اید",
      });

    await createPhaseCertificate({
      user_id: req?.user?.id,
      fullName: req?.body?.fullname,
      phase: req?.body?.phase_index,
      total_profit: "",
      withdraw_profit: "",
      userChallengeId: chFind?.id,
    });

    this.response({
      res,
      status: 200,
      message: "کاربر مای پراپ گواهینامه شما با موفقیت ساخته شد",
    });
  }
  async listChallenges(req, res) {
    const list = await UserChallenge.findAll({
      where: {
        user_id: req?.user?.id,
        current_phase_index: {
          [Op.gt]: 1,
        },
      },
      attributes: ["id", "current_phase_index"],
      include: [
        {
          model: ChallengeType,
          attributes: ["id", "name"],
        },
        {
          model: ChallengePlan,
          attributes: ["id", "title"],
        },
      ],
    });

    this.response({ res, data: list });
  }
};

module.exports = new Controller();
