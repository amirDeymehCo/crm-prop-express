const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const validator = require("./validation");
const asyncHandler = require("../../../../utils/asyncHandler");

// تعریف تسک‌ها
router
  .get("/", asyncHandler(Controller.listTasks))
  .post(
    "/",
    validator.createTask(),
    Controller.validationBody,
    asyncHandler(Controller.createTask),
  )
  .put("/:id", asyncHandler(Controller.updateTask))
  .delete("/:id", asyncHandler(Controller.deleteTask));

// بررسی ثبت‌های کاربران
router
  .get("/submissions/list", asyncHandler(Controller.listSubmissions))
  .post("/submissions/:id/approve", asyncHandler(Controller.approveSubmission))
  .post("/submissions/:id/reject", asyncHandler(Controller.rejectSubmission));

// امتیاز یک کاربر
router.get("/user-points/:user_id", asyncHandler(Controller.userPoints));

// پله‌های تخفیف
router
  .get("/tiers/list", asyncHandler(Controller.listTiers))
  .post(
    "/tiers/save",
    validator.saveTiers(),
    Controller.validationBody,
    asyncHandler(Controller.saveTiers),
  );

// خلاصه
router.get("/stats/summary", asyncHandler(Controller.summary));

module.exports = router;
