const express = require("express");
const validator = require("./validation");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const { upload } = require("../../../../middlewares/upload");

router
  .post(
    "/",
    upload.array("filesTicket", 5),
    validator.create(),
    Controller.validationBody,
    asyncHandler(Controller.create),
  )
  .get("/", asyncHandler(Controller.list))
  .get("/:id", asyncHandler(Controller.find))
  .post(
    "/sendMessage/:id",
    upload.array("filesTicket", 5),
    validator.sendMessage(),
    Controller.validationBody,
    asyncHandler(Controller.sendMessage),
  );

module.exports = router;
