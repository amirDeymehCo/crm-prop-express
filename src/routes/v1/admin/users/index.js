const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");
const can = require("../../../../middlewares/can");

router
  .get("/", can("user.list"), asyncHandler(Controller.listUsers))
  // posts
  .post(
    "/create",
    can("user.create"),
    validator.createUser(),
    Controller.validationBody,
    asyncHandler(Controller.createUser),
  )
  .post("/update/:id", can("user.create"), asyncHandler(Controller.updateUser))
  // wallet
  .post("/depositWallet", asyncHandler(Controller.depositWallet))
  .post("/withdrawWallet", asyncHandler(Controller.withdrawWallet))
  // find user
  .get("/:id", can("user.read"), asyncHandler(Controller.findUser))
  .get("/find-single-user/:id", asyncHandler(Controller.findUserDefaultData))
  // nots
  .get("/nots/:user_id", can("user.read"), asyncHandler(Controller.listNots))
  .post("/create-note", can("user.read"), asyncHandler(Controller.createNote));

module.exports = router;
