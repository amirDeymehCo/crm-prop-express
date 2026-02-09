const { PERMISSIONS, GROUPS } = require("./permissionsConfig");
const Permission = require("../models/Permission");
const PermissionGroup = require("../models/PermissionGroup");
const Admin = require("../models/Admin");

async function initRbac() {
  console.log("[RBAC] Initializing permissions & groups...");

  /* ================== 1) Groups ================== */
  const groupMap = {};

  for (const g of GROUPS) {
    const [group] = await PermissionGroup.findOrCreate({
      where: { code: g.code },
      defaults: {
        code: g.code,
        name: g.name,
        description: g.description || null,
        is_system: true,
      },
    });

    groupMap[g.code] = group;
  }

  /* ================== 2) Permissions ================== */
  const permissionMap = {};

  for (const g of GROUPS) {
    const group = groupMap[g.code];

    for (const permCode of g.permissions) {
      const permDef = PERMISSIONS.find((p) => p.code === permCode);

      if (!permDef) continue;

      const [perm] = await Permission.findOrCreate({
        where: { code: permCode },
        defaults: {
          code: permDef.code,
          description: permDef.description || null,
          permission_group_id: group.id,
        },
      });

      // اگر قبلاً ساخته شده ولی group نداشته یا اشتباه بوده
      if (perm.permission_group_id !== group.id) {
        await perm.update({ permission_group_id: group.id });
      }

      permissionMap[permCode] = perm;
    }
  }

  /* ================== 3) Super Admin ================== */
  await Admin.findOrCreate({
    where: { mobile: "09358468124" },
    defaults: {
      name: "Super Admin",
      mobile: "09358468124",
      password: "123456",
      email: "amir@gmail.com",
      is_super_admin: true,
    },
  });

  console.log("[RBAC] Done ✅");
}

module.exports = initRbac;
