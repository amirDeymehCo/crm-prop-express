// middleware/auth.js
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const authAdmin = (req, res, next) => {
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

      const userFind = await Admin.findByPk(user.id, {
        attributes: { exclude: ["password"] },
      }); if (!userFind) {
        return res.status(401).json({ message: "کاربر یافت نشد" });
      }


      req.admin = userFind?.dataValues
      next();
    }
  );
};

module.exports = authAdmin;