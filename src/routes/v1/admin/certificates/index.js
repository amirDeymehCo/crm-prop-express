const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const validation = require("./validation");

router
  .get("/", asyncHandler(Controller.listCarts))
  .post(
    "/create",
    validation.createWitdrawCart(),
    Controller.validationBody,
    asyncHandler(Controller.createWithdrawalCertificate),
  )
  .delete("/:id", asyncHandler(Controller.deleteCart));

module.exports = router;
