const express = require("express");
const router = express.Router();
const globalRouter = require("./globalRoutes");
const userRouter = require("./user");
const adminRouter = require("./admin");
const authRouter = require("./auth");
const authAdminRouter = require("./admin/auth");
const authUser = require("../../middlewares/auth");
const { authLimiter } = require("../../middlewares/rateLimit");
const authAdmin = require("../../middlewares/authAdmin");
const loadAdminPermissions = require("../../middlewares/loadAdminPermissions");

router.use("/auth", authLimiter, authRouter);
router.use("/authAdmin", authAdminRouter);
router.use("/global", globalRouter);
router.use("/user", authUser, userRouter);
router.use("/admin", authAdmin, adminRouter);

module.exports = router;
