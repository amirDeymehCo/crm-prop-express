const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");
const can = require("../../../../middlewares/can");

router
  .get("/", can("user.list"), asyncHandler(Controller.listUsers))
  .post(
    "/create",
    can("user.create"),
    validator.createUser(),
    Controller.validationBody,
    asyncHandler(Controller.createUser),
  )
  .post("/update/:id", can("user.create"), asyncHandler(Controller.updateUser))
  .post("/depositWallet", asyncHandler(Controller.depositWallet))
  .post("/withdrawWallet", asyncHandler(Controller.withdrawWallet))
  .get("/:id", can("user.read"), asyncHandler(Controller.findUser));

module.exports = router;
