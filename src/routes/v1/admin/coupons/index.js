const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .get("/", asyncHandler(Controller.list))
  .get("/:find", asyncHandler(Controller.single))
  .post("/create", asyncHandler(Controller.create));

module.exports = router;
