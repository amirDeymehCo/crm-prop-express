const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");

router.post(
  "/getUserDeatail",
  asyncHandler(Controller.getData)
)

// calls 
router
  .post("/call/create", validator.createCall(),
    Controller.validationBody, asyncHandler(Controller.createCall))
  .get("/call/history/:user_id", asyncHandler(Controller.callList));


// responsible
router.post("/responsible/:user_id", asyncHandler(Controller.responsible_admin));


// sms 
router
  .post("/sms/create", validator.createSms(),
    Controller.validationBody, asyncHandler(Controller.createSms))
  .get("/sms/history/:user_id", asyncHandler(Controller.smsList))

module.exports = router;
