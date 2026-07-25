const express = require("express");
const router = express.Router();
const { migrateUsersBatch } = require("./migrateLegacyUsers");

router.post("/users", migrateUsersBatch);

module.exports = router;
