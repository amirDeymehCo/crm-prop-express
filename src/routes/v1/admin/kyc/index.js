const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const Controller = require("./controller");
const can = require("../../../../middlewares/can");

router
  .get("/", can("kyc.list"), asyncHandler(Controller.list))
  .get("/:id", can("kyc.list"), asyncHandler(Controller.find))
  .post(
    "/change-stauts",
    can("kyc.list"),
    asyncHandler(Controller.changeStauts),
  );

module.exports = router;
