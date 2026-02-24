// middleware/authUser.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Setting = require("../models/Setting");

async function authUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    console.log("req?.cookies=>>>>>>>");
    console.log(req?.cookies);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "توکن ارسال نشده" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "access token منقضی شده",
          code: "TOKEN_EXPIRED",
        });
      }

      return res.status(401).json({
        message: "توکن معتبر نیست",
      });
    }

    if (decoded.type_token !== "user") {
      return res.status(401).json({ message: "توکن نامعتبر است" });
    }

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

    const amount_irr =
      (walletFind?.balance || 0) * (setting?.dollar_price || 0);

    req.user = {
      ...userFind.dataValues,
      wallet: { ...walletFind?.dataValues, amount_irr },
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    res.status(500).json({ message: "خطای داخلی سرور" });
  }
}

module.exports = authUser;
