const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router.get(
  "/show-profile",
  asyncHandler(Controller.findProfile)
)

module.exports = router;
