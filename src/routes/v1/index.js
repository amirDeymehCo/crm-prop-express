const express = require("express");
const router = express.Router();
const globalRouter = require("./globalRoutes");
const userRouter = require("./user");
const adminRouter = require("./admin");
const authRouter = require("./auth");
const authAdminRouter = require("./admin/auth");
const partnerRouter = require("./partner");
const authUser = require("../../middlewares/auth");
const { authLimiter } = require("../../middlewares/rateLimit");
const authAdmin = require("../../middlewares/authAdmin");
const authPartner = require("../../middlewares/authPartner");

router.use("/auth", authLimiter, authRouter);
router.use("/authAdmin", authAdminRouter);
router.use("/global", globalRouter);
router.use("/user", authUser, userRouter);
router.use("/admin", authAdmin, adminRouter);

// سرویس‌به‌سرویس با پنل PHP (احراز هویت با X-API-Key)
router.use("/partner", authPartner, partnerRouter);

module.exports = router;
