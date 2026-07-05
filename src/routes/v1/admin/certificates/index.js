const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const validation = require("./validation");
const can = require("../../../../middlewares/can");

router
  .get("/", can("certificate.list"), asyncHandler(Controller.listCarts))
  .post(
    "/create",
    can("certificate.create"),
    validation.createWitdrawCart(),
    Controller.validationBody,
    asyncHandler(Controller.createWithdrawalCertificate),
  )
  .delete(
    "/:id",
    can("certificate.create"),
    asyncHandler(Controller.deleteCart),
  );

module.exports = router;
