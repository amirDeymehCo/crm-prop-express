// middleware/authUser.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Op } = require("sequelize");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Setting = require("../models/Setting");

async function authUser(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "توکن ارسال نشده" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    // --- مرحله ۱: بررسی Access Token ---
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // اگر توکن منقضی شده (JWTExpiredError)
      if (err.name === "TokenExpiredError") {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
          return res
            .status(401)
            .json({ message: "توکن منقضی شد، لطفاً مجدداً وارد شوید" });
        }

        // hashed version
        const hashed = crypto
          .createHash("sha256")
          .update(refreshToken)
          .digest("hex");
        const user = await User.findOne({
          where: {
            refresh_token: hashed,
            refresh_token_expires_at: { [Op.gt]: new Date() },
          },
        });

        if (!user) {
          return res
            .status(401)
            .json({ message: "توکن معتبر نیست یا منقضی شده" });
        }

        // ساخت توکن جدید
        const newAccessToken = jwt.sign(
          { id: user.id, type_token: "user" },
          process.env.JWT_SECRET,
          { expiresIn: "15m" },
        );

        res.setHeader("x-new-access-token", newAccessToken);
        decoded = { id: user.id, type_token: "user" }; // ادامه جریان با توکن جدید
      } else {
        // سایر خطاهای JWT
        return res
          .status(401)
          .json({ message: "توکن معتبر نیست یا دستکاری شده است" });
      }
    }

    // --- مرحله ۲: نوع توکن باید 'user' باشد ---
    if (decoded?.type_token !== "user") {
      return res.status(401).json({ message: "توکن کاربر معتبر نیست" });
    }

    // --- مرحله ۳: واکشی داده‌ها ---
    const [userFind, walletFind, setting] = await Promise.all([
      User.findByPk(decoded.id, {
        attributes: { exclude: ["password", "responsible_admin_id"] },
      }),
      Wallet.findOne({ where: { user_id: decoded.id } }),
      Setting.findOne({ where: { id: 1 } }),
    ]);

    if (!userFind) {
      return res.status(404).json({ message: "کاربر یافت نشد" });
    }

    const amount_irr = walletFind?.balance * setting?.dollar_price;

    req.user = {
      ...userFind.dataValues,
      wallet: { ...walletFind?.dataValues, amount_irr },
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ message: "خطای داخلی سرور" });
  }
}

module.exports = authUser;
