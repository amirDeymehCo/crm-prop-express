const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const { userStrictLimiter } = require("../../../../middlewares/rateLimit");
const controller = require("./controller");

router.get(
    "/challenges",
    userStrictLimiter,
    asyncHandler(controller.challenges)
)

module.exports = router;
