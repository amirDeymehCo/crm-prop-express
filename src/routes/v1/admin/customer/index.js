const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router.post(
  "/get-data",
  asyncHandler(Controller.getData)
)

module.exports = router;
