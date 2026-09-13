const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");
const can = require("../../../../middlewares/can");

router
  .post(
    "/",
    can("profit.record"),
    validator.createRecord(),
    Controller.validationBody,
    asyncHandler(Controller.createRecord),
  )
  .post(
    "/:id",
    can("profit.record"),
    validator.createRecord(),
    Controller.validationBody,
    asyncHandler(Controller.editRecord),
  )
  .get("/", can("profit.record"), asyncHandler(Controller.listRocrods))
  .get("/:id", can("profit.record"), asyncHandler(Controller.findRecord))
  .delete("/:id", can("profit.record"), asyncHandler(Controller.deleteRecord));

module.exports = router;
