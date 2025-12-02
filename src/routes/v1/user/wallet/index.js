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
router.post(
  "/deposit-IR-callback",
  asyncHandler(Controller.depositIRRCallback)
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
  .post("/widthdrawRequest", validator.widthdrawRequest(), Controller.validationBody, asyncHandler(Controller.widthdrawRequest))
  .get("/transactionsList", asyncHandler(Controller.transactionsList))
  .get("/states", asyncHandler(Controller.states))


module.exports = router;
