const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router.post(
  "/login",
  asyncHandler(Controller.login)
)

module.exports = router;
