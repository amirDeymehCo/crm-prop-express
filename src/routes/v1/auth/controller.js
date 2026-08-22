const Controllers = require("../../controllers");
const User = require("../../../models/User");
const Otp = require("../../../models/Otp");
const {
  generateCode,
  sendCode,
} = require("../../../services/KavenegarService");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { sendOtpEmail } = require("../../../services/Email");
const trackAuth = require("../../../utils/UserTrack");

function generateAccessToken(user) {
  return jwt.sign({ id: user.id, type_token: "user" }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });
}
function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

async function createOtp({ mobile, ttlMinutes = 2 }) {
  const code = Math.floor(1000 + Math.random() * 9000).toString();

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  await Otp.update(
    { status: "expired" },
    {
      where: {
        mobile,
        status: "waiting",
      },
    },
  );

  const otp = await Otp.create({
    mobile,
    code_hash: codeHash,
    attempts: 0,
    status: "waiting",
    expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000),
  });

  return {
    otpId: otp.id,
    code,
    expiresAt: otp.expires_at,
  };
}

async function verifyOtpCode({ mobile, code, maxAttempts = 5 }) {
  const otp = await Otp.findOne({
    where: {
      mobile,
      status: "waiting",
      expires_at: { [Op.gt]: new Date() },
    },
    order: [["createdAt", "DESC"]],
  });

  if (!otp) {
    return {
      success: false,
      reason: "OTP_NOT_FOUND",
      message: "کد معتبری برای این شماره وجود ندارد",
    };
  }

  if (otp.attempts >= maxAttempts) {
    otp.status = "expired";
    await otp.save();

    return {
      success: false,
      reason: "MAX_ATTEMPTS",
      message: "تعداد تلاش بیش از حد مجاز",
    };
  }

  const inputHash = crypto
    .createHash("sha256")
    .update(String(code))
    .digest("hex");

  if (otp.code_hash !== inputHash) {
    otp.attempts += 1;
    await otp.save();

    return {
      success: false,
      reason: "INVALID_CODE",
      message: "کد وارد شده نادرست است",
    };
  }

  // ✅ موفق
  otp.status = "verify";
  await otp.save();

  return {
    success: true,
    otpId: otp.id,
    message: "کد با موفقیت تایید شد",
  };
}

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
          username: firstname + " " + lastname,
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
      const { code } = await createOtp({ mobile });
      // ارسال OTP (در صورت نیاز)
      const sent = await sendCode({ receptor: mobile, token: code });
      if (!sent) {
        return this.response({
          res,
          status: 500,
          message: "خطا در ارسال کد تایید",
        });
      }

      await trackAuth(req, user.id);

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
      where: { mobile },
    });

    if (!user)
      return res.status(400).json({ message: "کاربری با این مشخصات یافت نشد" });

    if (user?.status === "rejected")
      return this.response({
        res,
        status: 400,
        message: "کاربر گرامی حساب کاربری شما مسدود شده است",
      });
    if (!user?.verify_mobile)
      return "کاربر گرامی شماره تلفن شما تایید نشده است، لطفا دوباره اقدام به ثبت نام بفرمایید";

    if (!user || !(await user.verifyPassword(password))) {
      return res.status(400).json({ message: "کاربری با این مشخصات یافت نشد" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    const hashedRefreshToken = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    await user.update({
      refresh_token: hashedRefreshToken,
      refresh_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await trackAuth(req, user.id);

    return res.status(200).json({
      data: { accessToken },
      message: "ورود با موفقیت انجام شد",
    });
  }
  async verifyOtp(req, res) {
    const mobile = String(req.body.mobile).trim();
    const code = String(req.body.code).trim();

    const result = await verifyOtpCode({ mobile, code });

    if (!result?.success) {
      return this.response({
        res,
        status: 400,
        message: result?.message,
      });
    }

    const user = await User.findOne({ where: { mobile } });

    if (!user) {
      return this.response({
        res,
        status: 400,
        message: "کاربری با این شماره یافت نشد",
      });
    }

    if (user?.status === "rejected")
      return this.response({
        res,
        status: 400,
        message: "کاربر گرامی حساب کاربری شما مسدود شده است",
      });

    // ✅ تأیید شماره موبایل
    user.verify_mobile = true;
    await user.save();

    // ✅ ایجاد توکن‌ها
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    const hashedRefreshToken = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    await user.update({
      refresh_token: hashedRefreshToken,
      refresh_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await trackAuth(req, user.id);

    return this.response({
      res,
      data: {
        accessToken,
      },
      message: "به مای پراپ خوش آمدید",
    });
  }
  async forgotPassword(req, res) {
    try {
      const mobile = String(req?.body?.mobile || "").trim();

      const userFind = await User.findOne({
        where: { mobile },
      });

      if (!userFind) {
        return this.response({
          res,
          status: 400,
          message: "نام کاربری یا رمز عبور اشتباه است",
        });
      }

      if (userFind?.status === "rejected")
        return this.response({
          res,
          status: 400,
          message: "کاربر گرامی حساب کاربری شما مسدود شده است",
        });
      const { code } = await createOtp({ mobile });

      const sent = await sendCode({
        receptor: mobile,
        token: code,
      });

      if (!sent) {
        return this.response({
          res,
          status: 500,
          message: "در ارسال کد تایید مشکلی پیش آمده است، بعدا امتحان کنید",
        });
      }

      await trackAuth(req, userFind.id);

      return this.response({
        res,
        status: 200,
        message: "کد تایید شماره موبایل به تلفن شما ارسال شد",
      });
    } catch (err) {
      console.error("forgotPassword error:", err);
      return this.response({
        res,
        status: 500,
        message: "خطای سرور رخ داده است",
      });
    }
  }
  async sendOtp(req, res) {
    try {
      const mobile = String(req?.body?.mobile || "").trim();

      const userFind = await User.findOne({
        where: { mobile },
      });

      if (!userFind) {
        return this.response({
          res,
          status: 400,
          message: "نام کاربری یا رمز عبور اشتباه است",
        });
      }

      const { code } = await createOtp({ mobile });

      const sent = await sendCode({
        receptor: mobile,
        token: code,
      });

      if (!sent) {
        return this.response({
          res,
          status: 500,
          message: "در ارسال کد تایید مشکلی پیش آمده است، بعدا امتحان کنید",
        });
      }

      await trackAuth(req, user.id);

      return this.response({
        res,
        status: 200,
        message: "کد تایید ارسال شد",
      });
    } catch (err) {
      console.error("sendOtp error:", err);
      return this.response({
        res,
        status: 500,
        message: "خطای سرور رخ داده است",
      });
    }
  }
  async changePassword(req, res) {
    try {
      const mobile = String(req.body.mobile || "").trim();
      const code = String(req.body.code || "").trim();
      const password = String(req.body.password || "");

      if (!mobile || !code || !password) {
        return this.response({
          res,
          status: 400,
          message: "اطلاعات ورودی ناقص است",
        });
      }

      const otpResult = await verifyOtpCode({ mobile, code });

      if (!otpResult.success) {
        return this.response({
          res,
          status: 400,
          message: otpResult.message,
        });
      }

      const user = await User.findOne({ where: { mobile } });

      if (!user) {
        return this.response({
          res,
          status: 404,
          message: "کاربر یافت نشد",
        });
      }

      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      user.password = hashedPassword;
      await user.save();

      await trackAuth(req, user.id);

      return this.response({
        res,
        message: "رمز عبور با موفقیت تغییر یافت",
      });
    } catch (err) {
      console.error("changePassword error:", err);
      return this.response({
        res,
        status: 500,
        message: "خطای سرور رخ داده است",
      });
    }
  }

  async loginCode(req, res) {
    try {
      // برای سازگاری با فرانت فعلی mobile را هم قبول می‌کنیم
      // بهتر است در آینده نام این فیلد در فرانت identifier باشد.
      const identifier = String(req.body.mobile || "")
        .trim()
        .toLowerCase();

      if (!identifier) {
        return this.response({
          res,
          status: 400,
          message: "شماره موبایل یا ایمیل الزامی است",
        });
      }

      // شماره ایران با فرمت 0912... یا +98912... یا 98912...
      const normalizedMobile = identifier
        .replace(/\s|-/g, "")
        .replace(/^\+98/, "0")
        .replace(/^98/, "0");

      const isMobile = /^09\d{9}$/.test(normalizedMobile);

      // اعتبارسنجی ساده ایمیل
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

      if (!isMobile && !isEmail) {
        return this.response({
          res,
          status: 400,
          message: "شماره موبایل یا ایمیل واردشده معتبر نیست",
        });
      }

      const channel = isMobile ? "mobile" : "email";
      const destination = isMobile ? normalizedMobile : identifier;

      const user = await User.findOne({
        where: isMobile ? { mobile: normalizedMobile } : { email: identifier },
      });

      if (!user) {
        return this.response({
          res,
          status: 400,
          message:
            channel === "mobile"
              ? "کاربری با این شماره موبایل پیدا نشد"
              : "کاربری با این ایمیل پیدا نشد",
        });
      }

      // بررسی تأیید شماره در ورود با موبایل
      if (channel === "mobile" && !user.verify_mobile) {
        return this.response({
          res,
          status: 400,
          message:
            "کاربر گرامی شماره تلفن شما تأیید نشده است، لطفاً دوباره اقدام به ثبت‌نام بفرمایید",
        });
      }

      /*
      اگر در مدل User فیلد verify_email داری، این بخش را فعال نگه دار.
      اگر هنوز چنین ستونی نداری، این if را حذف کن.
    */
      if (channel === "email" && user.verify_email === false) {
        return this.response({
          res,
          status: 400,
          message:
            "کاربر گرامی ایمیل شما تأیید نشده است، لطفاً ابتدا ایمیل خود را تأیید کنید",
        });
      }

      /*
      نکته:
      createOtp فعلی تو احتمالاً فقط mobile می‌گیرد.
      بهتر است آن را تغییر بده تا destination و channel را هم ذخیره کند.

      فعلاً اگر createOtp در دیتابیس OTP را با فیلد mobile ذخیره می‌کند،
      destination را به آن پاس بده تا برای ایمیل هم کار کند؛
      ولی از نظر نام‌گذاری/ساختار بهتر است بعداً فیلد destination داشته باشی.
    */
      const { code } = await createOtp({
        mobile: destination,
        channel,
        userId: user.id,
      });

      let sent = false;

      if (channel === "mobile") {
        sent = await sendCode({
          receptor: destination,
          token: code,
        });
      } else {
        console.log("STARTED=>");

        const emailResult = await sendOtpEmail({
          to: destination,
          code,
        });

        // nodemailer در صورت ارسال موفق معمولاً info برمی‌گرداند
        sent = Boolean(emailResult?.messageId || emailResult);
      }

      if (!sent) {
        return this.response({
          res,
          status: 500,
          message:
            channel === "mobile"
              ? "در ارسال کد تأیید پیامکی مشکلی پیش آمده است، بعداً امتحان کنید"
              : "در ارسال کد تأیید ایمیل مشکلی پیش آمده است، بعداً امتحان کنید",
        });
      }

      await trackAuth(req, user.id);

      return this.response({
        res,
        status: 201,
        message:
          channel === "mobile"
            ? "کد تأیید به شماره تلفن شما ارسال شد"
            : "کد تأیید به ایمیل شما ارسال شد",

        // اگر فرانت نیاز دارد بداند صفحه بعدی چه نوع OTP است
        data: {
          channel,
        },
      });
    } catch (error) {
      console.error("loginCode error:", error);

      return this.response({
        res,
        status: 500,
        message: "خطایی در ارسال کد تأیید رخ داده است",
      });
    }
  }
  async logout(req, res) {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      const hashed = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      await User.update(
        { refresh_token: null, refresh_token_expires_at: null },
        { where: { refresh_token: hashed } },
      );
    }

    res.clearCookie("refreshToken", {
      sameSite: "none",
      secure: true,
      path: "/",
    });

    res.json({ message: "خروج با موفقیت انجام شد" });
  }
  async refreshToken(req, res) {
    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) {
      return res.sendStatus(401);
    }

    const hashedOld = crypto
      .createHash("sha256")
      .update(oldRefreshToken)
      .digest("hex");

    const user = await User.findOne({
      where: {
        refresh_token: hashedOld,
        refresh_token_expires_at: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      res.clearCookie("refreshToken");
      return res.sendStatus(403);
    }

    // ✅ ROTATION
    const newRefreshToken = generateRefreshToken();
    const hashedNew = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    const newAccessToken = generateAccessToken(user);

    await user.update({
      refresh_token: hashedNew,
      refresh_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await trackAuth(req, user.id);

    return res.json({
      accessToken: newAccessToken,
    });
  }
};

module.exports = new Controller();
