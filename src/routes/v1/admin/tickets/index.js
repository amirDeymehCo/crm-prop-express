const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const Controller = require("./controller");
const { upload } = require("../../../../middlewares/upload");
const validator = require("./validation");

router
  .get("/", asyncHandler(Controller.list))
  .get("/auto-messages-list", asyncHandler(Controller.autoMessages))
  .post("/create-auto-message", asyncHandler(Controller.createMessage))
  .post("/notes", asyncHandler(Controller.createNote))
  .get("/notes/:id", asyncHandler(Controller.notesList))
  .post(
    "/",
    upload.array("filesTicket", 5),
    validator.create(),
    Controller.validationBody,
    asyncHandler(Controller.create),
  )
  .post(
    "/:id",
    validator.update(),
    Controller.validationBody,
    asyncHandler(Controller.update),
  )
  .get("/:id", asyncHandler(Controller.find))
  .post(
    "/sendMessage/:id",
    upload.array("filesTicket", 5),
    validator.sendMessage(),
    Controller.validationBody,
    asyncHandler(Controller.sendMessage),
  );

module.exports = router;
