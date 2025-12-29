const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const { upload } = require("../../../../middlewares/upload");

router
  .post(
    "/updated-profile",
    asyncHandler(Controller.updatedProfile)
  )
  .get(
    "/show-profile",
    asyncHandler(Controller.findProfile)
  )
  .get(
    "/refral-states",
    asyncHandler(Controller.refralStates)
  )
  .get(
    "/refral-list",
    asyncHandler(Controller.refralList)
  )
  .post(
    "/change-avatar",
    upload.single("avatar"),
    asyncHandler(Controller.changeAvatar)
  )

module.exports = router;
