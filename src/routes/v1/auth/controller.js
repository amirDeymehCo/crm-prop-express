const Controllers = require("../../controllers");
const User = require("../../../models/User");
const Otp = require("../../../models/Otp");
const jwt = require("jsonwebtoken");

const Controller = class extends Controllers {
  async register(req, res) {
    const findUserByMobile = await User.findOne({
      where: { mobile: req.body.mobile, verify_mobile: true },
    });
    if (findUserByMobile)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این شماره تلفن قبلا ثبت نام کرده است",
      });

    const findUserByEmail = await User.findOne({
      where: { email: req.body.email, verify_mobile: true },
    });
    if (findUserByEmail)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این ایمیل قبلا ثبت نام کرده است",
      });

    const newUser = await User.create({
      firstname: req?.body?.firstname,
      lastname: req?.body?.lastname,
      mobile: req?.body?.mobile,
      email: req?.body?.email,
      password: req?.body?.password,
      status: "approved"
    });

    if (!newUser) {
      return this.response({
        status: 400,
        message: "متاسفانه در عملیات ثبت نام مشکلی پیش آمده است",
      });
    }
    const newOtp = await Otp.create({
      mobile: req?.body?.mobile,
      code: 1234,
      status: "waiting",
    });

    console.log("new Create................................................................")
    this.response({
      res,
      status: 201,
      message: "کد تایید تلفن شما ارسال شد",
    });
  }
  async profile(req, res) {

    if (!req?.user) return this.response({ res, status: 400, message: "ابتدا وارد سایت شوید!" })

    this.response({ res, data: req?.user, message: "اطلاعات کاربری" });
  }
  async loginPassword(req, res) {
    const mobile = String(req.body.mobile).trim();
    const password = String(req.body.password);

    const user = await User.findOne({
      where: { mobile, verify_mobile: true },
    });

    if (!user) {
      return res.status(400).json({ message: "کاربری با این مشخصات یافت نشد" });
    }

    const passVerify = await user.verifyPassword(password);
    console.log("password:", password);
    console.log("passVerify:", passVerify);

    if (!passVerify) {
      return res.status(400).json({ message: "کاربری با این مشخصات یافت نشد" });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || "dawdawfawf_adjaiwdhawihfmafa", {
      expiresIn: "24h",
    });

    this.response({
      res,
      data: { token },
      message: "به مای پراپ خوش آمدید",
    });

  }
  async verifyOtp(req, res) {
    try {
      const mobile = String(req.body.mobile).trim();
      const code = String(req.body.code).trim();

      const otp = await Otp.findOne({
        where: { mobile, status: "waiting" },
        order: [["createdAt", "DESC"]], // اگه چند تا OTP هست، آخریش
      });

      if (!otp) {
        return this.response({
          res,
          status: 400,
          message: "کدی برای این شماره تلفن ارسال نشده است",
        });
      }

      const pastTime = Date.now() - new Date(otp.createdAt).getTime();

      if (pastTime >= 2 * 60 * 1000) {
        otp.status = "expired";
        await otp.save();

        return this.response({
          res,
          status: 400,
          message: "کد ارسالی منقضی شده است",
        });
      }

      if (String(otp.code) !== code) {
        return this.response({
          res,
          status: 400,
          message: "کد ارسالی اشتباه است",
        });
      }

      otp.status = "verify";
      await otp.save();

      const user = await User.findOne({ where: { mobile } });

      if (!user) {
        return this.response({
          res,
          status: 400,
          message: "کاربری با این شماره تلفن یافت نشد",
        });
      }

      user.verify_mobile = true;
      await user.save();

      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || "dawdawfawf_adjaiwdhawihfmafa", {
        expiresIn: "24h",
      });

      return this.response({
        res,
        data: { token },
        message: "به مای پراپ خوش آمدید",
      });
    } catch (err) {
      console.error(err);
      return this.response({
        res,
        status: 500,
        message: "خطای سرور رخ داده است",
      });
    }
  }
  async forgotPassword(req, res) {
    const userFind = await User.findOne({
      where: { mobile: req?.body?.mobile },
    });

    if (!userFind) {
      return this.response({
        status: 400,
        message: "کاربری با این شماره تلفن یافت نشد",
      });
    }

    await Otp.create({
      mobile: req?.body?.mobile,
      code: 1234,
      status: "waiting",
    });

    this.response({
      res,
      status: 200,
      message: "کد تایید شماره موبایل به تلفن شما ارسال شد",
    });
  }
  async sendOtp(req, res) {
    const userFind = await User.findOne({
      where: { mobile: req?.body?.mobile },
    });

    if (!userFind) {
      return this.response({
        status: 400,
        message: "کاربری با این شماره تلفن یافت نشد",
      });
    }

    await Otp.create({
      mobile: req?.body?.mobile,
      code: 1234,
      status: "waiting",
    });

    this.response({
      res,
      status: 200,
      message: "کد تایید ارسال شد",
    });
  }
  async changePassword(req, res) {
    const { mobile, code } = req.body;
    const otp = await Otp.findOne({
      where: { mobile, status: "waiting" },
      order: [["createdAt", "DESC"]],
    });
    if (!otp)
      return this.response({
        res,
        status: 400,
        message: "کدی برای این شماره تلفن ارسال نشده است",
      });

    let targetDate = new Date(otp?.createdAt);
    let currentDate = new Date();
    let pastTime = currentDate.getTime() - targetDate.getTime();

    if (pastTime >= 2 * 60 * 1000) {
      return this.response({
        res,
        status: 400,
        message: "کد ارسالی منقضی شده است",
      });
    }

    if (otp?.code != code)
      return this.response({
        res,
        status: 400,
        message: "کد ارسالی اشتباه است",
      });

    otp.status = "verify";
    await otp.save();

    const user = await User.findOne({ where: { mobile } });

    if (!user)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این شماره تلفن ارسالی یافن نشد",
      });

    user.password = req?.body?.password;
    await user.save();

    this.response({
      res,
      message: "رمز عبور شما تغیر یافت لطفا دوباره وارد سایت شوید",
    });
  }
  async loginCode(req, res) {
    const findUserByMobile = await User.findOne({
      where: { mobile: req.body.mobile, verify_mobile: true },
    });
    if (!findUserByMobile)
      return this.response({
        res,
        status: 400,
        message: "کاربری با این شماره موبایل پیدا نشد"
      });


    this.response({
      res,
      status: 201,
      message: "کد تایید تلفن شماارسال شد",
    });
  }
};

module.exports = new Controller();
