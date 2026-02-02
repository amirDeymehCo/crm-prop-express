const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const { userStrictLimiter } = require("../../../../middlewares/rateLimit");
const controller = require("./controller");

router
  .get("/users", asyncHandler(controller.users))
  .get("/rejectedOptions", asyncHandler(controller.rejectedOptions))
  .get("/resultOptions", asyncHandler(controller.resultOptions))
  .get("/challenges", asyncHandler(controller.challenges))
  .get("/refral-list", asyncHandler(controller.refral))
  .get("/type-challenges", asyncHandler(controller.typeChallenge))
  .get("/plans/:type", asyncHandler(controller.plansFind));

module.exports = router;
