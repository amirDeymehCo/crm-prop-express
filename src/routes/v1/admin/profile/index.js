const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const Controller = require("./controller");

router
  .get("/", asyncHandler(Controller.profile))
  .post("/", asyncHandler(Controller.updateProfile));

module.exports = router;
