const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");
const can = require("../../../../middlewares/can");

router.post("/getUserDeatail", asyncHandler(Controller.getData));

// calls
router
  .post(
    "/call/create",
    can("sales.calls.create"),
    validator.createCall(),
    Controller.validationBody,
    asyncHandler(Controller.createCall),
  )
  .get(
    "/call/history",
    can("sales.calls.create"),
    asyncHandler(Controller.callList),
  )
  .get(
    "/call/:id",
    can("sales.calls.read"),
    asyncHandler(Controller.sinlgeCall),
  )
  .post(
    "/call/create-note",
    can("sales.calls.create"),
    asyncHandler(Controller.create_note),
  );

// responsible
router.post(
  "/responsible/:user_id",
  can("sales.calls.create"),
  asyncHandler(Controller.responsible_admin),
);

// sms
router
  .post(
    "/sms/create",
    can("sales.sms.send"),
    validator.createSms(),
    Controller.validationBody,
    asyncHandler(Controller.createSms),
  )
  .get("/sms/history", can("sales.sms.list"), asyncHandler(Controller.smsList));

// remainder

router
  .get("/remeinder-count", asyncHandler(Controller.remeinderCount))
  .get("/remeinder-list", asyncHandler(Controller.remeinderList));

router
  .get(
    "/user-challenges/:user_id",
    can("sales.calls.create"),
    asyncHandler(Controller.userChallenges),
  )
  .get(
    "/history-calls/:user_id",
    can("sales.calls.create"),
    asyncHandler(Controller.historyCalls),
  )
  .get(
    "/history-messages/:user_id",
    can("sales.calls.create"),
    asyncHandler(Controller.historyMessages),
  );

module.exports = router;
