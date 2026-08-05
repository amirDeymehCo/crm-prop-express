const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router.get("/users-chart", asyncHandler(Controller.newUsersChart));
router.get(
  "/challenge-type-sale",
  asyncHandler(Controller.challengeSalesChart),
);

module.exports = router;
