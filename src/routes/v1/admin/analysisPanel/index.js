const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

/**
 * پنل آنالیز مای‌پراپ
 *
 * همه‌ی روت‌ها پارامتر اختیاری ?range می‌گیرند:
 *   today | 7d | 1m (پیش‌فرض) | this_month | 3m | 6m | 1y
 */

// کاربران و تبدیل
router
  .get("/users-chart", asyncHandler(Controller.newUsersChart))
  .get("/user-conversion", asyncHandler(Controller.userConversion))
  .get("/sales-funnel", asyncHandler(Controller.salesFunnel));

// چالش‌ها
router
  .get("/challenge-type-sale", asyncHandler(Controller.challengeSalesChart))
  .get("/challenge-purchase-rate", asyncHandler(Controller.challengePurchaseRate))
  .get("/best-challenge", asyncHandler(Controller.bestChallenge))
  .get("/best-challenges", asyncHandler(Controller.bestChallenges))
  .get("/challenge-revenue", asyncHandler(Controller.challengeRevenue))
  .get("/challenges-status", asyncHandler(Controller.challengesStatus))
  .get("/rejection-reasons", asyncHandler(Controller.rejectionReasons))
  .get("/real-reach-rate", asyncHandler(Controller.realReachRate));

// قسطی/نقدی و بیمه — با فیلتر ?challenge_type_id=<id|all>
router
  .get("/challenge-type-tabs", asyncHandler(Controller.challengeTypeTabs))
  .get("/payment-plan-stats", asyncHandler(Controller.paymentPlanStats))
  .get("/insurance-stats", asyncHandler(Controller.insuranceStats));

// درآمد
router
  .get("/revenue-trend", asyncHandler(Controller.revenueTrend))
  .get("/sales-target", asyncHandler(Controller.salesTarget));

// تماس و پشتیبانی
router
  .get("/calls-status", asyncHandler(Controller.callsStatus))
  .get("/peak-hours", asyncHandler(Controller.peakHours))
  .get("/new-tickets", asyncHandler(Controller.newTickets))
  .get("/sellers-performance", asyncHandler(Controller.sellersPerformance))
  .get("/supporters-performance", asyncHandler(Controller.supportersPerformance));

module.exports = router;
