const express = require("express");
const validator = require("./validation");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../utils/asyncHandler");
const { otpLimiter } = require("../../../middlewares/rateLimit");

router.post(
  "/register",
  validator.register(),
  Controller.validationBody,
  asyncHandler(Controller.register),
);
router.post(
  "/send-otp",
  otpLimiter,
  validator.forgotPassword(),
  Controller.validationBody,
  asyncHandler(Controller.sendOtp),
);
router.post(
  "/forgot-password",
  otpLimiter,
  validator.forgotPassword(),
  Controller.validationBody,
  asyncHandler(Controller.forgotPassword),
);
router.post(
  "/change-password",
  validator.changePassword(),
  Controller.validationBody,
  asyncHandler(Controller.changePassword),
);
router.post(
  "/verify-otp",
  validator.verifyOtp(),
  Controller.validationBody,
  asyncHandler(Controller.verifyOtp),
);
router.post(
  "/login-width-password",
  validator.loginPassword(),
  Controller.validationBody,
  asyncHandler(Controller.loginPassword),
);
router.post(
  "/login-width-code",
  otpLimiter,
  validator.loginCode(),
  Controller.validationBody,
  asyncHandler(Controller.loginCode),
);

module.exports = router;
