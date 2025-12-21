// initRbac.js
const { PERMISSIONS, GROUPS } = require("./permissionsConfig");

const Permission = require("../models/Permission");
const PermissionGroup = require("../models/PermissionGroup");
const Admin = require("../models/Admin"); // مدل admins
// اگر مدل‌های join رو هم نیاز داشتی می‌تونی import کنی، ولی با associations نیازی نیست مستقیم استفاده‌شون کنی.

async function initRbac() {
    console.log("[RBAC] Initializing permissions & groups...");

    // ۱) ساخت/آپدیت Permissionها
    const permissionMap = {};
    for (const p of PERMISSIONS) {
        const [perm] = await Permission.findOrCreate({
            where: { code: p.code },
            defaults: {
                code: p.code,
                description: p.description || null,
            },
        });
        permissionMap[p.code] = perm;
    }

    // ۲) ساخت/آپدیت Groupها و وصل کردن permissionها
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

        // لیست permissionهای این گروه بر اساس code
        const permsForGroup = g.permissions
            .map(code => permissionMap[code])
            .filter(Boolean);

        // اگر می‌خوای همیشه دقیقاً همین‌ها باشن:
        await group.setPermissions(permsForGroup);
        // اگر دوست داری فقط اضافه کنی و قبلی‌ها بمونن:
        // await group.addPermissions(permsForGroup);
    }

    // ۳) (اختیاری) ساخت یک سوپر ادمین پیش‌فرض
    const [admin] = await Admin.findOrCreate({
        where: { mobile: "09358468124" },
        defaults: {
            name: "Super Admin",
            mobile: "09358468124",
            // یادت نره این رو در عمل هش کنی
            password: "123456",
            email: "amir@gmail.com",
            is_super_admin: true,
        },
    });

}

module.exports = initRbac;
