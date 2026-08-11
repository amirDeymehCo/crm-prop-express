const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const validator = require("./validation");
const { userStrictLimiter } = require("../../../../middlewares/rateLimit");

router
  .get("/list", userStrictLimiter, asyncHandler(Controller.list))
  .get(
    "/list-challenegs",
    userStrictLimiter,
    asyncHandler(Controller.listChallenges),
  )
  .post(
    "/create",
    // userStrictLimiter,
    validator.create(),
    Controller.validationBody,
    asyncHandler(Controller.create),
  );

module.exports = router;
