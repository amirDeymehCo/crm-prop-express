// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Setting = require("../models/Setting");

const authUser = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "توکن معتبر نیست" });
  }

  if (!token) {
    return res.status(401).json({ message: "لطفا وارد سیستم شوید" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "dawdawfawf_adjaiwdhawihfmafa",
    async (err, user) => {
      if (err) {
        return res.status(401).json({ message: "لطفا وارد سیستم شوید" });
      }
      if (user?.type_token !== "user") {
        return res.status(401).json({ message: "کاربر یافت نشد" });
      }

      const userFind = await User.findByPk(user.id, {
        attributes: { exclude: ["password", "responsible_admin_id"] },
      });
      if (!userFind) {
        return res.status(401).json({ message: "کاربر یافت نشد" });
      }

      const walletFind = await Wallet.findOne({
        where: { user_id: userFind?.id },
      });
      const setting = await Setting.findOne({ where: { id: 1 } });
      const amount_irr = walletFind?.balance * setting?.dollar_price;

      req.user = {
        ...userFind.dataValues,
        wallet: { ...walletFind?.dataValues, amount_irr },
      };
      next();
    },
  );
};

module.exports = authUser;
