const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const Controller = require("./controller");
const { upload } = require("../../../../middlewares/upload");
const validator = require("./validation");
const can = require("../../../../middlewares/can");

router
  .post(
    "/",
    upload.single("avatar"),
    can("JUST_SUPER"),
    asyncHandler(Controller.create),
  )
  .get("/", can("JUST_SUPER"), asyncHandler(Controller.list))
  .get(
    "/permissions-list",
    can("JUST_SUPER"),
    asyncHandler(Controller.permissionsList),
  )
  .get(
    "/get-current-permission/:admin_id",
    can("JUST_SUPER"),
    asyncHandler(Controller.getCurrenctPermissions),
  )
  .post(
    "/permission-set",
    can("JUST_SUPER"),
    asyncHandler(Controller.setPermission),
  );

module.exports = router;
