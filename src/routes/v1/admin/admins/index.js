const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const Controller = require("./controller");
const { upload } = require("../../../../middlewares/upload");
const validator = require("./validation");

router
  .post("/", upload.single("avatar"), asyncHandler(Controller.create))
  .get("/", asyncHandler(Controller.list))
  .get("/permissions-list", asyncHandler(Controller.permissionsList))
  .get(
    "/get-current-permission/:admin_id",
    asyncHandler(Controller.getCurrenctPermissions),
  )
  .post("/permission-set", asyncHandler(Controller.setPermission));

module.exports = router;
