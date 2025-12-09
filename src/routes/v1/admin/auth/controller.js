const Controllers = require("../../../controllers");
const Admin = require("../../../../models/Admin");
const Call = require("../../../../models/Call");
const CallRejectReason = require("../../../../models/CallRejectReason");
const CallResult = require("../../../../models/CallResult");
const CallResultOption = require("../../../../models/CallResultOption");
const Permission = require("../../../../models/Permission");
const jwt = require("jsonwebtoken");


const Controller = class extends Controllers {
  async login(req, res) {
    const mobile = String(req.body.mobile).trim();
    const password = String(req.body.password);

    const admin = await Admin.findOne({
      where: { mobile },
    });

    if (!admin) {
      return res.status(400).json({ message: "ادمینی با این مشخصات یافت نشد" });
    }

    const passVerify = await admin.verifyPassword(password);

    if (!passVerify) {
      return res.status(400).json({ message: "ادمینی با این مشخصات یافت نشد" });
    }

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    this.response({
      res,
      data: { token },
      message: "ادمین محترم، به مای پراپ خوش آمدید",
    });

  }
};

module.exports = new Controller();
