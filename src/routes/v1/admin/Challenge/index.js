const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const can = require("../../../../middlewares/can");

router
  .post(
    "/create",
    can("order.create"),
    asyncHandler(Controller.createChallenge),
  )
  .post(
    "/change-status",
    can("order.create"),
    asyncHandler(Controller.changeStatus),
  )
  .get("/list", can("order.list"), asyncHandler(Controller.userChallenges))
  .get("/find/:id", can("order.read"), asyncHandler(Controller.singleChallenge))
  .get(
    "/rejected-rasions",
    can("order.create"),
    asyncHandler(Controller.rejectedRasions),
  )
  .get(
    "/find-rejected-user-ch/:user_challenge_id",
    can("order.read"),
    asyncHandler(Controller.getRejectionReasonsByUserChallengeId),
  )
  .get(
    "/get-analysis-data/:mt_login",
    can("order.read"),
    asyncHandler(Controller.getAnalysisData),
  );

module.exports = router;
