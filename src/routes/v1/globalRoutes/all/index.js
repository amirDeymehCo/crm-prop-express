const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .all("/callback-peykan", asyncHandler(Controller.callbackPeykan))
  .all("/callback-peykan-challenge", asyncHandler(Controller.callbackBuyCh))
  .get("/getPlansList", asyncHandler(Controller.getPlansList))
  .get("/getPhase/:planId", asyncHandler(Controller.getPhase));

module.exports = router;
