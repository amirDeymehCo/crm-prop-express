const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");
const { upload } = require("../../../../middlewares/upload");

router
  // صفحه‌ی کامل تسک‌ها و امتیازها
  .get("/", asyncHandler(Controller.list))

  // فقط کارت امتیاز و تخفیف
  .get("/my-points", asyncHandler(Controller.myPoints))

  // تاریخچه‌ی ثبت‌ها
  .get("/my-submissions", asyncHandler(Controller.mySubmissions))

  // کدهای تخفیفی که از امتیاز ساخته شده
  .get("/my-coupons", asyncHandler(Controller.myCoupons))

  // تبدیل امتیاز به کد تخفیف اختصاصی
  .post("/generate-coupon", asyncHandler(Controller.generateCoupon))

  // ثبت انجام تسک + مدرک
  .post(
    "/submit",
    upload.array("filesTask", 5),
    validator.submit(),
    Controller.validationBody,
    asyncHandler(Controller.submit),
  );

module.exports = router;
