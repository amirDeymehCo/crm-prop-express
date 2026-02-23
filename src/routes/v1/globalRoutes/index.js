const express = require("express");
const router = express.Router();
const allRoutes = require("./all");
const initialRoutes = require("./initial-data");

router.use("/", allRoutes);
router.use("/initial-data", initialRoutes);

module.exports = router;
