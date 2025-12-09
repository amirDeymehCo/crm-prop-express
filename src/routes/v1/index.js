const express = require("express");
const router = express.Router();
const userRouter = require("./user");
const adminRouter = require("./admin");
const authRouter = require("./auth");
const authUser = require("../../middlewares/auth");
const { authLimiter } = require("../../middlewares/rateLimit");



router.use("/auth", authLimiter, authRouter);
router.use("/user", authUser, userRouter);
router.use("/admin", adminRouter);


module.exports = router;