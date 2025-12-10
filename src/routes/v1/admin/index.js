const express = require("express");
const router = express.Router();
const authRouter = require("./auth");
const customerRouter = require("./customer");
const authAdmin = require("../../../middlewares/authAdmin");
const loadAdminPermissions = require("../../../middlewares/loadAdminPermissions");

router.use("/auth", authRouter);
router.use("/customer", authAdmin, loadAdminPermissions, customerRouter);


module.exports = router;

