const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .get("/users", asyncHandler(Controller.listUsers))
  .get("/orders", asyncHandler(Controller.listUsersByChallenge));

module.exports = router;
