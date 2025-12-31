const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const validator = require("./validation");
const { userStrictLimiter } = require("../../../../middlewares/rateLimit");

router.post(
  "/deposit-IR",
  userStrictLimiter,
  validator.depositIRR(),
  Controller.validationBody,
  asyncHandler(Controller.depositIRR)
)
router.post(
  "/deposit-IR-callback",
  userStrictLimiter,
  asyncHandler(Controller.depositIRRCallback)
)
  .post(
    "/deposit/nowpayment",
    userStrictLimiter,
    validator.depositUSD(),
    Controller.validationBody,
    asyncHandler(Controller.depositUSD)
  )
  .post(
    "/deposit/nowpayment/ipn",
    userStrictLimiter,
    asyncHandler(Controller.ipnNowPayment)
  )
  .post("/create-otp-widthdraw", userStrictLimiter, validator.widthdrawRequest(), Controller.validationBody, asyncHandler(Controller.createOtpWidhdraw))
  .post("/widthdrawRequest", userStrictLimiter, validator.widthdrawRequest(), Controller.validationBody, asyncHandler(Controller.widthdrawRequest))
  .get("/transactionsList", asyncHandler(Controller.transactionsList))
  .get("/states", asyncHandler(Controller.states))


module.exports = router;
