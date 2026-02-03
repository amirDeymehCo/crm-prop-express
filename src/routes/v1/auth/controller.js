const Controllers = require("../../controllers");
const User = require("../../../models/User");
const Otp = require("../../../models/Otp");
const {
  generateCode,
  sendCode,
} = require("../../../services/KavenegarService");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

const Controller = class extends Controllers {
  async register(req, res) {
    try {
      const { firstname, lastname, mobile, email, password, referral_code } =
        req.body;

      /* --------------------------------------------------
       * 1) بررسی وجود کاربر با موبایل یا ایمیل
       * -------------------------------------------------- */
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [{ mobile }, email ? { email } : null].filter(Boolean),
        },
      });

      // اگر کاربر قبلاً verify شده → اجازه ثبت نام نده
      if (existingUser && existingUser.verify_mobile === true) {
        let message = "کاربری با این اطلاعات قبلاً ثبت‌نام کرده است";

        if (existingUser.mobile === mobile) {
          message = "کاربری با این شماره تلفن قبلاً ثبت‌نام کرده است";
        } else if (email && existingUser.email === email) {
          message = "کاربری با این ایمیل قبلاً ثبت‌نام کرده است";
        }

        return this.response({
          res,
          status: 400,
          message,
        });
      }

      /* --------------------------------------------------
       * 2) بررسی referral_code (در صورت ارسال)
       * -------------------------------------------------- */
      let referrer_id = null;

      if (referral_code) {
        const referrer = await User.findOne({
          where: {
            referral_code,
            status: "approved",
          },
        });

        if (!referrer) {
          return this.response({
            res,
            status: 400,
            message:
              "کد معرف معتبر نیست. لطفاً کد را بررسی و مجدداً تلاش کنید.",
          });
        }

        referrer_id = referrer.id;
      }

      /* --------------------------------------------------
       * 3) ساخت یا آپدیت کاربر
       * -------------------------------------------------- */
      let user;

      // اگر کاربر هست ولی موبایلش verify نشده → آپدیت
      if (existingUser && existingUser.verify_mobile === false) {
        user = existingUser;

        user.firstname = firstname;
        user.lastname = lastname;
        user.mobile = mobile;
        user.email = email;
        user.password = password; // حتماً در عمل واقعی هش شود
        user.status = "approved";

        // رفرال فقط یک‌بار ست می‌شود
        if (referrer_id && !user.referrer_id) {
          user.referrer_id = referrer_id;
        }

        await user.save();
      }
      // اگر کاربر جدید است → ایجاد
      else {
        user = await User.create({
          firstname,
          lastname,
          mobile,
          email,
          password, // حتماً هش شود
          status: "approved",
          referrer_id,
        });
      }

      if (!user) {
        return this.response({
          res,
          status: 400,
          message: "خطا در ایجاد حساب کاربری",
        });
      }

      /* --------------------------------------------------
       * 4) تولید و ذخیره OTP
       * -------------------------------------------------- */
      const newCode = generateCode(4);

      // منقضی کردن OTPهای قبلی
      await Otp.update(
        { status: "expired" },
        { where: { mobile, status: "waiting" } },
      );

      // ارسال OTP (در صورت نیاز)
      const sent = await sendCode({ receptor: mobile, token: newCode });
      if (!sent) {
        return this.response({
          res,
          status: 500,
          message: "خطا در ارسال کد تایید",
        });
      }

      await Otp.create({
        mobile,
        code: newCode,
        status: "waiting",
      });

      /* --------------------------------------------------
       * 5) پاسخ نهایی
       * -------------------------------------------------- */
      return this.response({
        res,
        status: existingUser ? 200 : 201,
        message: "کد تایید ارسال شد",
        // فقط برای تست:
        // data: { otp: newCode },
      });
    } catch (error) {
      console.error("Register error:", error);

      return this.response({
        res,
        status: 500,
        message: "خطای داخلی سرور",
        data: error?.message,
      });
    }
  }
  async profile(req, res) {
    if (!req?.user)
      return this.response({
        res,
        status: 400,
        message: "ابتدا وارد سایت شوید!",
      });

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

    if (!passVerify) {
      return res.status(400).json({ message: "کاربری با این مشخصات یافت نشد" });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
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
      } else {
        otp.status = "verify";
        await otp.save();
      }

      const user = await User.findOne({ where: { mobile } });

      if (!user) {
        return this.response({
          res,
          status: 400,
          message: "نام کاربری یا رمز عبور اشتباه است",
        });
      }

      user.verify_mobile = true;
      await user.save();

      const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET || "dawdawfawf_adjaiwdhawihfmafa",
        {
          expiresIn: "24h",
        },
      );

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
        message: "نام کاربری یا رمز عبور اشتباه است",
      });
    }

    const newCode = generateCode(4);
    const sent = await sendCode({
      receptor: req?.body?.mobile,
      token: newCode,
    });
    if (!sent) {
      return this.response({
        res,
        status: 500,
        message: "در ارسال کد تایید مشکلی پیش آمده است، بعدا امتحان کنید",
      });
    }

    await Otp.create({
      mobile: req?.body?.mobile,
      code: newCode,
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
        message: "نام کاربری یا رمز عبور اشتباه است",
      });
    }

    const newCode = generateCode(4);
    const sent = await sendCode({
      receptor: req?.body?.mobile,
      token: newCode,
    });
    if (!sent) {
      return this.response({
        res,
        status: 500,
        message: "در ارسال کد تایید مشکلی پیش آمده است، بعدا امتحان کنید",
      });
    }

    await Otp.create({
      mobile: req?.body?.mobile,
      code: newCode,
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
      otp.status = "expired";
      await otp.save();
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
        message: "نام کاربری یا رمز عبور اشتباه است",
      });

    user.password = req?.body?.password;
    await user.save();

    this.response({
      res,
      message: "کاربر مای پراپ، رمز عبور شما با موفقیت تغییر یافت",
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
        message: "کاربری با این شماره موبایل پیدا نشد",
      });

    const newCode = generateCode(4);
    const sent = await sendCode({
      receptor: req?.body?.mobile,
      token: newCode,
    });
    if (!sent) {
      return this.response({
        res,
        status: 500,
        message: "در ارسال کد تایید مشکلی پیش آمده است، بعدا امتحان کنید",
      });
    }

    await Otp.create({
      mobile: req?.body?.mobile,
      code: newCode,
      status: "waiting",
    });

    this.response({
      res,
      status: 201,
      message: "کد تایید تلفن شماارسال شد",
    });
  }
};

module.exports = new Controller();
