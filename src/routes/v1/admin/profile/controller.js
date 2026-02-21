const Controllers = require("../../../controllers");
const Admin = require("../../../../models/Admin");
const Permission = require("../../../../models/Permission");
const PermissionGroup = require("../../../../models/PermissionGroup");
const bcrypt = require("bcrypt");

const Controller = class extends Controllers {
  async updateProfile(req, res) {
    if (req?.body?.newPassword) {
      const salt = await bcrypt.genSalt(10);
      req.body.password = await bcrypt.hash(req?.body?.newPassword, salt);
    }

    const admin = await Admin.update(req?.body, {
      where: { id: req?.admin?.id },
    });

    this.response({ res, status: 200, message: "اطلاعات پروفایل ذخیره شد" });
  }
  async profile(req, res) {
    const admin = await Admin.findByPk(req?.admin?.id, {
      include: [
        {
          model: PermissionGroup,
          as: "PermissionGroups",
          include: [
            {
              model: Permission,
              as: "Permissions",
            },
          ],
        },
        {
          model: Permission,
          as: "Permissions",
        },
      ],
    });

    const groupPermissions_codes = admin?.PermissionGroups?.map((e) => e?.code);

    let newPermissions = [];
    admin?.PermissionGroups?.forEach((e, i) => {
      newPermissions = [...newPermissions, ...e?.Permissions];
    });
    let permissions_codes = newPermissions?.map((e) => e?.code);
    admin?.Permissions?.forEach((e) => {
      const group = e?.code?.split(".")[0];
      if (!groupPermissions_codes?.includes(group)) {
        groupPermissions_codes.push(group);
      }

      permissions_codes?.push(e?.code);
    });

    const resFormat = {
      id: admin?.id,
      name: admin?.name,
      is_super_admin: admin?.is_super_admin ?? false,
      mobile: admin?.mobile,
      permissions_codes,
      groupPermissions_codes,
    };

    res.json(resFormat);
  }
};

module.exports = new Controller();
