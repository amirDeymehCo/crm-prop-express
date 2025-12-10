const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const UserChallenge = require("../../../../models/UserChallenge");
const Call = require("../../../../models/Call/Call");
const CallRejectReason = require("../../../../models/Call/CallRejectReason");
const CallResultOption = require("../../../../models/Call/CallResultOption");
const Admin = require("../../../../models/Admin");
const sequelize = require("../../../../../db")

const Controller = class extends Controllers {
  async getData(req, res) {
    const { mobile } = req?.body;
    const findUser = await User.findOne({ where: { mobile }, attributes: { exclude: ["password"] } })
    if (!findUser) return this.response({ res, status: 400, message: "کاربری با این شماره تلفن یافت نشد" })
    const userChallenge = await UserChallenge.findAll({ where: { user_id: findUser?.id }, attributes: { exclude: ["mt_password", "mt_server", "in_password"] } });


    this.response({
      res, status: 200, message: "اطلاعات مشتری", data: {
        userData: findUser,
        challenges: userChallenge
      }
    })
  }
  async createCall({ body, admin }, res) {
    const t = await sequelize.transaction();
    const result_option_ids = body?.result_option_ids ? JSON.parse(body?.result_option_ids) : []

    if (body?.is_answer == "false" && !body?.reject_reason_id) {
      return this.response({ res, status: 400, message: "باید دلیل پاسخ ندادن انتخاب شود" })
    }

    const newCall = await Call.create({ ...body, reject_reason_id: body?.reject_reason_id || null, user_id: body?.user_id, admin_id: admin?.id }, { transaction: t })
    if (body?.is_answer == "true") {
      if (Array.isArray(result_option_ids) && result_option_ids.length > 0) {
        await newCall.setResults(result_option_ids, { transaction: t });
      } else {
        await t.rollback()
        return this.response({ res, status: 400, message: "باید نتیجه تماس را انتخاب کنید" })
      }
    }

    await t.commit()

    this.response({ res, status: 200, message: "تماس با موفقیت ساخته شد" })
  }
  async callList(req, res) {
    const callList = await Call.findAll({
      where: { user_id: req.params?.user_id },

      include: [
        {
          model: CallRejectReason,
          as: "reject_reason",
          attributes: ["id", "title"]
        },
        {
          model: CallResultOption,
          as: "results",
          attributes: ["id", "title", "description"],
          through: {
            attributes: []
          }
        }
      ],
    });

    this.response({ res, data: callList, message: "لیست تماس ها" })

  }
  async responsible_admin(req, res) {
    const findUser = await User.findOne({ id: req?.params?.user_id })
    if (!findUser) this.response({ res, status: 400, message: "کاربری با این شناسه پیدا نشد" })
    if (findUser?.responsible_admin_id) return this.response({ res, status: 400, message: "مدیریت این کاربر قبلا انتخاب شده است" })

    const setUserResponsible_admin_id = await User.update({ responsible_admin_id: req?.admin?.id }, { where: { id: req?.params?.user_id } });
    if (!setUserResponsible_admin_id) return this.response({ res, status: 400, message: "کاربری با این شناسه پیدا نشد" })

    this.response({ res, status: 200, message: `ادمین ${req?.admin?.name} مدیریت کاربر ${findUser?.firstname + "  " + findUser?.lastname} به شما سپرده شد! ` })

  }
};

module.exports = new Controller();
