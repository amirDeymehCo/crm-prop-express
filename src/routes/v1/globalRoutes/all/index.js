const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .all("/callback-peykan", asyncHandler(Controller.callbackPeykan))
  .all("/callback-peykan-challenge", asyncHandler(Controller.callbackBuyCh));

module.exports = router;
