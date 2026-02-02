const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");

router
  .get(
    "/",
    asyncHandler(Controller.listUsers)
  )
  .post(
    "/create",
    validator.createUser(),
    Controller.validationBody,
    asyncHandler(Controller.createUser)
  )
  .post(
    "/update/:id",
    asyncHandler(Controller.updateUser)
  )
  .post(
    "/depositWallet",
    asyncHandler(Controller.depositWallet)
  )
  .get("/:id", asyncHandler(Controller.findUser))

module.exports = router;
