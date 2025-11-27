const express = require("express");
const router = express.Router();
const userRouter = require("./user");
const authRouter = require("./auth");
const authUser = require("../../middlewares/auth");



router.use("/auth", authRouter);
router.use("/user", authUser, userRouter);


module.exports = router;

