const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const Controller = require("./controller");
const { upload } = require("../../../../middlewares/upload");
const validator = require("./validation");

router
  // auto messgaes
  .get("/auto-messages-list", asyncHandler(Controller.autoMessages))
  .post("/create-auto-message", asyncHandler(Controller.createMessage))
  .post("/update-auto-message", asyncHandler(Controller.updtaeAutoMessage))
  .post("/delete-auto-message", asyncHandler(Controller.delteMessage))
  // nots
  .post("/notes", asyncHandler(Controller.createNote))
  .get("/notes/:id", asyncHandler(Controller.notesList))
  // ticket
  .get("/", asyncHandler(Controller.list))
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
  // send message
  .post(
    "/sendMessage/:id",
    upload.array("filesTicket", 5),
    validator.sendMessage(),
    Controller.validationBody,
    asyncHandler(Controller.sendMessage),
  );

module.exports = router;
