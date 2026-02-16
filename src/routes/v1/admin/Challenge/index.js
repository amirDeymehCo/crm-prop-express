const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .post("/create", asyncHandler(Controller.createChallenge))
  .post("/change-status", asyncHandler(Controller.changeStatus))
  .get("/list", asyncHandler(Controller.userChallenges))
  .get("/find/:id", asyncHandler(Controller.singleChallenge))
  .get("/rejected-rasions", asyncHandler(Controller.rejectedRasions))
  .get(
    "/find-rejected-user-ch/:user_challenge_id",
    asyncHandler(Controller.getRejectionReasonsByUserChallengeId),
  );

module.exports = router;
