const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const validator = require("./validation")

router.post(
  "/deposit-IR",
  validator.depositIRR(),
  Controller.validationBody,
  asyncHandler(Controller.depositIRR)
)
  .post(
    "/deposit/nowpayment",
    validator.depositUSD(),
    Controller.validationBody,
    asyncHandler(Controller.depositUSD)
  )
  .post(
    "/deposit/nowpayment/ipn",
    asyncHandler(Controller.ipnNowPayment)
  )
  .get("/paykan/callback", asyncHandler(Controller.callbackPaykan))
  .post("/paykan/callback", asyncHandler(Controller.callbackPaykanPost))
  .post("/widthdrawRequest", validator.widthdrawRequest(), Controller.validationBody, asyncHandler(Controller.widthdrawRequest))


module.exports = router;
