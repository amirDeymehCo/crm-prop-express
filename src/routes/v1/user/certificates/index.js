const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const validator = require("./validation");
const { userStrictLimiter } = require("../../../../middlewares/rateLimit");

router.get("/list", userStrictLimiter, asyncHandler(Controller.list));

module.exports = router;
