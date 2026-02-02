const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");

router.post("/getUserDeatail", asyncHandler(Controller.getData));

// calls
router
  .post(
    "/call/create",
    validator.createCall(),
    Controller.validationBody,
    asyncHandler(Controller.createCall),
  )
  .get("/call/history", asyncHandler(Controller.callList))
  .get("/call/:id", asyncHandler(Controller.sinlgeCall))
  .post("/call/create-note", asyncHandler(Controller.create_note));

// responsible
router.post(
  "/responsible/:user_id",
  asyncHandler(Controller.responsible_admin),
);

// sms
router
  .post(
    "/sms/create",
    validator.createSms(),
    Controller.validationBody,
    asyncHandler(Controller.createSms),
  )
  .get("/sms/history", asyncHandler(Controller.smsList));

module.exports = router;
