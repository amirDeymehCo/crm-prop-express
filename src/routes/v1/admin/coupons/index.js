const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const can = require("../../../../middlewares/can");

router
  .get("/", can("discount.list"), asyncHandler(Controller.list))
  .post("/create", can("discount.manage"), asyncHandler(Controller.create))
  .get("/:id", can("discount.manage"), asyncHandler(Controller.single))
  .post("/:id", can("discount.manage"), asyncHandler(Controller.update));

module.exports = router;
