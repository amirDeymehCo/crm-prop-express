const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");
const can = require("../../../../middlewares/can");

router
  .post("/update", can("JUST_SUPER"), asyncHandler(Controller.updateSetting))
  .get("/", can("JUST_SUPER"), asyncHandler(Controller.findSetting));

module.exports = router;
