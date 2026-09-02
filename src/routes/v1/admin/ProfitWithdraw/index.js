const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");
const can = require("../../../../middlewares/can");

router
  .post(
    "/",
    can("JUST_SUPER"),
    validator.createRecord(),
    Controller.validationBody,
    asyncHandler(Controller.createRecord),
  )
  .post(
    "/:id",
    can("JUST_SUPER"),
    validator.createRecord(),
    Controller.validationBody,
    asyncHandler(Controller.editRecord),
  )
  .get("/", can("JUST_SUPER"), asyncHandler(Controller.listRocrods))
  .get("/:id", can("JUST_SUPER"), asyncHandler(Controller.findRecord))
  .delete("/:id", can("JUST_SUPER"), asyncHandler(Controller.deleteRecord));

module.exports = router;
