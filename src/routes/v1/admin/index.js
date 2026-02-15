const express = require("express");
const router = express.Router();
const customerRouter = require("./customer");
const usersRouter = require("./users");
const ticketsRouter = require("./tickets");
const challengeRouter = require("./Challenge");
const couponsRouter = require("./coupons");
const kycRouter = require("./kyc");
const listFindsRouter = require("./listFinds");
const adminsRouter = require("./admins");
const certificatesRouter = require("./certificates");
const Admin = require("../../../models/Admin");
const Permission = require("../../../models/Permission");
const PermissionGroup = require("../../../models/PermissionGroup");

router.use("/users", usersRouter);
router.use("/customer", customerRouter);
router.use("/listFinds", listFindsRouter);
router.use("/tickets", ticketsRouter);
router.use("/challenge", challengeRouter);
router.use("/coupons", couponsRouter);
router.use("/kyc", kycRouter);
router.use("/admins", adminsRouter);
router.use("/certificates", certificatesRouter);

router.get("/profile", async (req, res) => {
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
});

module.exports = router;
