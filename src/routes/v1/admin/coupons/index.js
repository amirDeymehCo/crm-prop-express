const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .get("/", asyncHandler(Controller.list))
  .post("/create", asyncHandler(Controller.create))
  .get("/:id", asyncHandler(Controller.single))
  .post("/:id", asyncHandler(Controller.update));

module.exports = router;
