const express = require("express");
const router = express.Router();

const Controller = require("./controller");
const validation = require("./validation");
const asyncHandler = require("../../../utils/asyncHandler");
const { partnerLimiter } = require("../../../middlewares/rateLimit");

router.use(partnerLimiter);

router
  // ۱) استعلام دسته‌ای حساب‌های fail شده
  .post(
    "/recovery/accounts",
    validation.lookupAccounts(),
    Controller.validationBody,
    asyncHandler(Controller.lookupAccounts),
  )

  // ۲) ثبت مبلغ جدید و ساخت فاکتور بازیابی
  .post(
    "/recovery/offers",
    validation.createOffer(),
    Controller.validationBody,
    asyncHandler(Controller.createOffer),
  )

  // وضعیت فاکتور با external_ref
  .get(
    "/recovery/offers",
    validation.offerRef(),
    Controller.validationBody,
    asyncHandler(Controller.getOffer),
  )

  // وضعیت فاکتور با شناسه‌ی داخلی
  .get(
    "/recovery/offers/:id",
    validation.offerRef(),
    Controller.validationBody,
    asyncHandler(Controller.getOffer),
  )

  // ابطال فاکتور پرداخت‌نشده
  .post(
    "/recovery/offers/:id/cancel",
    validation.cancelOffer(),
    Controller.validationBody,
    asyncHandler(Controller.cancelOffer),
  )

  // ارسال مجدد اطلاع‌رسانی‌های نرسیده
  .post("/recovery/callbacks/retry", asyncHandler(Controller.retryCallbacks));

module.exports = router;
