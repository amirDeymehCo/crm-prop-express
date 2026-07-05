// middleware/auth.js
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const PermissionGroup = require("../models/PermissionGroup");
const Permission = require("../models/Permission");

const authAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "توکن معتبر نیست" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret",
    );

    if (decoded?.type_token !== "admin") {
      return res.status(401).json({ message: "ادمین یافت نشد" });
    }

    // اینجا PermissionGroup + Permissions را لود می‌کنیم
    const admin = await Admin.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
      include: [
        {
          model: PermissionGroup,
          as: "PermissionGroups",
          through: { attributes: [] },
          include: [
            {
              model: Permission,
              as: "Permissions",
            },
          ],
        },
      ],
    });

    if (!admin) {
      return res.status(401).json({ message: "ادمین یافت نشد" });
    }

    // استخراج تمام permission code ها
    const flatPermissions = [
      ...new Set(
        admin.PermissionGroups.flatMap(
          (group) => group.Permissions?.map((p) => p.code) || [],
        ),
      ),
    ];

    req.admin = {
      ...admin.toJSON(),
      permissions: flatPermissions,
    };

    return next();
  } catch (err) {
    return res.status(401).json({ message: "لطفا وارد سیستم شوید" });
  }
};

module.exports = authAdmin;
