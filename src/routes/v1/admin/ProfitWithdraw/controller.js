const Controllers = require("../../../controllers");
const ProfitWithdraw = require("../../../../models/ProfitWithdraw");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan");
const ChallengeType = require("../../../../models/Challenge/ChallengeType");
const Setting = require("../../../../models/Setting");
const User = require("../../../../models/User");
const Admin = require("../../../../models/Admin");
const founcList = require("../../../../utils/List");

const Controller = class extends Controllers {
  async createRecord(req, res) {
    const { amount_usd, refound_usd, ch_id } = req?.body;

    const userChallenge = await UserChallenge.findByPk(ch_id, {
      attributes: ["id", "user_id"],
    });
    if (!userChallenge)
      return this.response({
        res,
        status: 400,
        message: "شناسه سفارش اشتباه است",
      });

    const setting = await Setting.findByPk(1);

    const amount_irr = Number(amount_usd) * setting.dollar_price * 10;
    const refound_irr = Number(refound_usd || 0) * setting.dollar_price * 10;

    await ProfitWithdraw.create({
      amount_usd,
      refound_usd: refound_usd || 0,
      amount_irr,
      refound_irr,
      user_challenge_id: userChallenge?.id,
      user_id: userChallenge?.user_id,
      admin_id: req?.admin?.id,
    });

    this.response({
      res,
      status: 201,
      message: "رکورد برداشت سود با موفقیت ساخته شد",
    });
  }
  async editRecord(req, res) {
    const { amount_usd, refound_usd, ch_id } = req?.body;

    const userChallenge = await UserChallenge.findByPk(ch_id, {
      attributes: ["id", "user_id"],
    });
    if (!userChallenge)
      return this.response({
        res,
        status: 400,
        message: "شناسه سفارش اشتباه است",
      });

    const setting = await Setting.findByPk(1);

    const amount_irr = Number(amount_usd) * setting.dollar_price * 10;
    const refound_irr = Number(refound_usd || 0) * setting.dollar_price * 10;

    await ProfitWithdraw.update(
      {
        amount_usd,
        refound_usd: refound_usd || 0,
        amount_irr,
        refound_irr,
        user_challenge_id: userChallenge?.id,
        user_id: userChallenge?.user_id,
        admin_id: req?.admin?.id,
      },
      { where: { id: req?.params?.id } },
    );

    this.response({
      res,
      status: 201,
      message: "رکورد برداشت سود با موفقیت ویرایش شد",
    });
  }
  async listRocrods(req, res) {
    const list = await founcList(
      ProfitWithdraw,
      req,
      {},
      {
        include: [
          {
            model: UserChallenge,
            attributes: ["id", "current_phase_index", "status"],
            include: {
              model: ChallengePlan,
              attributes: ["id", "title", "balance"],
              include: {
                model: ChallengeType,
                attributes: ["id", "name"],
              },
            },
          },
          {
            model: Admin,
            attributes: ["id", "avatar", "name"],
          },
          {
            model: Admin,
            attributes: ["id", "avatar", "name"],
          },
        ],
      },
    );

    this.response({ res, status: 200, data: list });
  }
  async findRecord(req, res) {
    const singleRecord = await ProfitWithdraw.findByPk(req?.params?.id);
    if (!singleRecord)
      return this.response({ res, status: 400, message: "اطلاعاتی یافت نشد" });

    this.response({ res, status: 200, data: singleRecord });
  }
  async deleteRecord(req, res) {
    const singleRecord = await ProfitWithdraw.destroy({
      where: { id: req?.params?.id },
    });
    if (!singleRecord)
      return this.response({ res, status: 400, message: "اطلاعاتی یافت نشد" });

    this.response({ res, message: "رکورد با موفقیت حذف شد" });
  }
};

module.exports = new Controller();
