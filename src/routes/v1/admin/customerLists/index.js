const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .get("/users", asyncHandler(Controller.listUsers))
  .get("/orders", asyncHandler(Controller.listUsersByChallenge))
  .get(
    "/lead-users-by-active-challenges",
    asyncHandler(Controller.listUsersByManyActiveChallenges),
  )
  .get(
    "/lead-users-by-never-purchased",
    asyncHandler(Controller.listUsersNeverPurchased),
  )
  .get(
    "/lead-users-by-many-closed-challenges",
    asyncHandler(Controller.listUsersByManyClosedChallenges),
  );

module.exports = router;
