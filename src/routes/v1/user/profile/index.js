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
  .get(
    "/avatars-list",
    asyncHandler(Controller.avatarsList)
  )
  .post(
    "/change-avatar",
    upload.single("avatar"),
    asyncHandler(Controller.changeAvatar)
  )
  .post(
    "/select-avatar",
    asyncHandler(Controller.selectAvatar)
  )
  .post(
    "/change-password",
    asyncHandler(Controller.changePassword)
  )

module.exports = router;
