const express = require("express");
const router = express.Router();
const allRoutes = require("./all");



router.use("/", allRoutes);

module.exports = router;