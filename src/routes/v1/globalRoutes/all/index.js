const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router.all("/callback-peykan", asyncHandler(Controller.callbackPeykan));

module.exports = router;
