// middleware/loadAdminPermissions.js
const Admin = require("../models/Admin");
const Permission = require("../models/Permission");
const PermissionGroup = require("../models/PermissionGroup");

async function loadAdminPermissions(req, res, next) {
  if (!req.admin?.id) return next();

  // const admin = await Admin.findByPk(req.admin?.id, {
  //     include: [
  //         {
  //             model: Permission,
  //             through: { attributes: [] },
  //         },
  //         {
  //             model: PermissionGroup,
  //             include: [
  //                 {
  //                     model: Permission,
  //                     through: { attributes: [] },
  //                 },
  //             ],
  //             through: { attributes: [] },
  //         },
  //     ],
  // });

  // if (!admin) return res.status(401).json({ message: "Admin not found" });

  // const directPermissions = admin.Permissions || [];
  // const groupPermissions =
  //     admin.PermissionGroups?.flatMap(g => g.Permissions || []) || [];

  // const allCodes = [
  //     ...directPermissions.map(p => p.code),
  //     ...groupPermissions.map(p => p.code),
  // ];

  // const uniqueCodes = [...new Set(allCodes)];

  // req.admin = {
  //     id: admin.id,
  //     is_super_admin: admin.is_super_admin,
  //     permissions: uniqueCodes,
  // };

  next();
}

module.exports = loadAdminPermissions;
