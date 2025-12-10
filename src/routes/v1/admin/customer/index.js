const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");

router.post(
  "/getUserDeatail",
  asyncHandler(Controller.getData)
)
  .post("/call/create", validator.createCall(),
    Controller.validationBody, asyncHandler(Controller.createCall))
  .get("/call/history/:user_id", asyncHandler(Controller.callList))
  .post("/responsible/:user_id", asyncHandler(Controller.responsible_admin))

module.exports = router;
