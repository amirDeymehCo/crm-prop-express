const express = require("express");
const validator = require("./validation");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../utils/asyncHandler");
const authenticateTokenUser = require("../../../middlewares/auth");

router.post(
  "/register",
  validator.register(),
  Controller.validationBody,
  asyncHandler(Controller.register)
);
router.post(
  "/send-otp",
  validator.forgotPassword(),
  Controller.validationBody,
  asyncHandler(Controller.sendOtp)
);
router.post(
  "/forgot-password",
  validator.forgotPassword(),
  Controller.validationBody,
  asyncHandler(Controller.forgotPassword)
);
router.post(
  "/change-password",
  validator.changePassword(),
  Controller.validationBody,
  asyncHandler(Controller.changePassword)
);
router.post(
  "/verify-otp",
  validator.verifyOtp(),
  Controller.validationBody,
  asyncHandler(Controller.verifyOtp)
);
router.post(
  "/login-width-password",
  validator.loginPassword(),
  Controller.validationBody,
  asyncHandler(Controller.loginPassword)
);
router.post(
  "/login-width-code",
  validator.loginCode(),
  Controller.validationBody,
  asyncHandler(Controller.loginCode)
);
router.get("/profile", authenticateTokenUser, asyncHandler(Controller.profile));

module.exports = router;
