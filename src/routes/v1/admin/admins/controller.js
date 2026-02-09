const Controllers = require("../../../controllers");
const PermissionGroup = require("../../../../models/PermissionGroup");
const Permission = require("../../../../models/Permission");
const Admin = require("../../../../models/Admin");
const AdminPermission = require("../../../../models/AdminPermission");
const founcList = require("../../../../utils/List");
const { Op } = require("sequelize");
const sequelize = require("../../../../../db");

const Controller = class extends Controllers {
  async list(req, res) {
    const whare = {};
    if (req?.query?.name) whare.name = { [Op.like]: `%${req?.query?.name}%` };

    const admins = await founcList(Admin, req, whare, {
      include: [
        {
          model: Admin,
          as: "creator",
          attributes: ["id", "avatar", "name", "mobile"],
        },
      ],
    });

    this.response({
      res,
      status: 200,
      data: admins,
    });
  }
  async create(req, res) {
    const file = req?.file?.filename || null;

    console.log(file);

    const newAdmin = await Admin.create({
      ...req?.body,
      avatar: file,
      creator_admin_id: req?.admin?.id,
    });
    this.response({ res, status: 201, message: "ادمین با موفقیت ساخته شد" });
  }
  async permissionsList(req, res) {
    const groups = await PermissionGroup.findAll({
      attributes: ["id", "name", "code", "description", "is_system"],
      include: [
        {
          model: Permission,
          as: "Permissions",
          attributes: ["id", "code", "description"],
        },
      ],
      order: [
        ["id", "ASC"],
        [{ model: Permission, as: "Permissions" }, "id", "ASC"],
      ],
    });

    this.response({ res, status: 200, data: groups });
  }
  async setPermission(req, res) {
    let { admin_id, fullGroupIds = [], customPermissions = {} } = req.body;

    // ✅ normalize
    fullGroupIds = fullGroupIds.map(Number);

    const normalizedCustom = {};
    Object.entries(customPermissions).forEach(([groupId, perms]) => {
      normalizedCustom[Number(groupId)] = perms.map(Number);
    });
    customPermissions = normalizedCustom;

    // ✅ full group priority
    Object.keys(customPermissions).forEach((groupId) => {
      if (fullGroupIds.includes(Number(groupId))) {
        delete customPermissions[groupId];
      }
    });

    return sequelize.transaction(async (t) => {
      const admin = await Admin.findByPk(admin_id, { transaction: t });

      if (!admin) {
        return res.status(400).json({ message: "ادمین یافت نشد" });
      }

      if (admin.is_super_admin) {
        return res.status(400).json({
          message: "امکان تغییر سطح دسترسی ادمین کل وجود ندارد",
        });
      }

      /* ========= 1️⃣ Full groups ========= */
      const groups = await PermissionGroup.findAll({
        where: { id: fullGroupIds },
        transaction: t,
      });

      if (groups.length !== fullGroupIds.length) {
        return res.status(400).json({
          message: "برخی گروه‌های دسترسی معتبر نیستند",
        });
      }

      await admin.setPermissionGroups(groups, { transaction: t });

      /* ========= 2️⃣ Reset permissions ========= */
      await admin.setPermissions([], { transaction: t });

      /* ========= 3️⃣ Partial permissions ========= */
      const permissionIds = Object.values(customPermissions).flat();

      if (permissionIds.length) {
        const permissions = await Permission.findAll({
          where: { id: permissionIds },
          transaction: t,
        });

        if (permissions.length !== permissionIds.length) {
          return res.status(400).json({
            message: "برخی پرمیشن‌ها معتبر نیستند",
          });
        }

        await admin.addPermissions(permissions, { transaction: t });
      }

      return res.json({
        message: " سطح دسترسی ادمین با موفقیت ذخیره شد",
      });
    });
  }
  async getCurrenctPermissions(req, res) {
    const adminId = req?.params?.admin_id;

    const admin = await Admin.findByPk(adminId, {
      include: [
        {
          model: PermissionGroup,
          as: "PermissionGroups",
          attributes: ["id"],
          include: [
            {
              model: Permission,
              as: "Permissions",
              attributes: ["id"],
            },
          ],
        },
        {
          model: Permission,
          as: "Permissions",
          attributes: ["id", "permission_group_id"],
        },
      ],
    });

    if (!admin) {
      return this.response({
        res,
        status: 400,
        message: "ادمینی یافت نشد",
      });
    }

    /* ======================
        سوپر ادمین
  =======================*/
    if (admin.is_super_admin) {
      const allGroups = await PermissionGroup.findAll({
        attributes: ["id"],
      });

      return this.response({
        res,
        status: 200,
        data: {
          admin_id: adminId,
          fullGroupIds: allGroups.map((g) => g.id),
          customPermissions: {},
        },
      });
    }

    const fullGroupIds = [];
    const customPermissions = {};

    /* ======================
        گروه‌های کامل
  =======================*/
    admin.PermissionGroups.forEach((group) => {
      fullGroupIds.push(group.id);
    });

    /* ======================
        پرمیشن‌های تکی (override)
  =======================*/
    admin.Permissions.forEach((perm) => {
      const groupId = perm.permission_group_id;

      // اگر گروهش full هست
      if (fullGroupIds.includes(groupId)) return;

      if (!customPermissions[groupId]) {
        customPermissions[groupId] = [];
      }

      customPermissions[groupId].push(perm.id);
    });

    return this.response({
      res,
      status: 200,
      data: {
        admin_id: adminId,
        fullGroupIds,
        customPermissions,
      },
    });
  }
};

module.exports = new Controller();
