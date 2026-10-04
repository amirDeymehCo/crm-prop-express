const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const authPartner = require("../../../../middlewares/authPartner");

router
  .all("/callback-peykan", asyncHandler(Controller.callbackPeykan))
  .all("/callback-peykan-challenge", asyncHandler(Controller.callbackBuyCh))
  .all(
    "/callback-paykan-challenge-insurance",
    asyncHandler(Controller.callbackBuyCh),
  )
  .all("/callback-peykan-recovery", asyncHandler(Controller.callbackRecovery))
  .get("/getPlansList", asyncHandler(Controller.getPlansList))
  .get("/getPhase/:planId", asyncHandler(Controller.getPhase))
  .post("/isLogined", asyncHandler(Controller.isLogined))
  // سرویس‌به‌سرویس: پنل PHP با هدر X-API-Key صدا می‌زند
  .post(
    "/decrementWallet",
    authPartner,
    asyncHandler(Controller.decrementWallet),
  )

module.exports = router;
