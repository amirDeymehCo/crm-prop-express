const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validation = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");

router.get(
  "/getPlansList",
  asyncHandler(Controller.getPlansList)
).get(
  "/getPhase/:planId",
  asyncHandler(Controller.getPhase)
)
  .post(
    "/buy-challenge",
    validation.buyChallenge(),
    Controller.validationBody,
    asyncHandler(Controller.buyPlan)
  )
  .post(
    "/buy-challenge-callback",
    asyncHandler(Controller.callbaclBuyCh)
  )

module.exports = router;
