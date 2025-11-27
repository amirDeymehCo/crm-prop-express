const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router.post(
  "/",
  asyncHandler(Controller.updateProfile)
)

module.exports = router;
