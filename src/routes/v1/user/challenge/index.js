const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validation = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .get("/user-challenges", asyncHandler(Controller.userChallenges))
  .get("/user-challenges/:id", asyncHandler(Controller.singleChallenge))
  .get("/getPlansList", asyncHandler(Controller.getPlansList))
  .get("/getPhase/:planId", asyncHandler(Controller.getPhase))
  .post(
    "/buy-challenge",
    validation.buyChallenge(),
    Controller.validationBody,
    asyncHandler(Controller.buyPlan),
  )
  .post("/buy-challenge-callback", asyncHandler(Controller.callbackBuyCh))
  .post(
    "/request-change-status",
    validation.requestChangeStatus(),
    Controller.validationBody,
    asyncHandler(Controller.requestChangeStatus),
  )
  .post(
    "/check-copun",
    validation.checkCopun(),
    Controller.validationBody,
    asyncHandler(Controller.checkCopun),
  )
  .post(
    "/pay-pending-challenge",
    Controller.validationBody,
    asyncHandler(Controller.payPendingChallenge),
  )
  .get(
    "/get-analysis-data/:mt_login",
    asyncHandler(Controller.getAnalysisData),
  );

module.exports = router;
