const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validation = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .post("/change-status", asyncHandler(Controller.changeStatus))
  .get("/list", asyncHandler(Controller.userChallenges))
  .get("/find/:id", asyncHandler(Controller.singleChallenge));

module.exports = router;
