const express = require("express");
const router = express.Router();
const Controller = require("./migrateLegacyUsers");
const asyncHandler = require("../../../../utils/asyncHandler");
const {
  startLegacyUsersMigration,
  getLegacyUsersMigrationStatus,
} = require("./controller");

router.post("/legacy-users/run", startLegacyUsersMigration);

router.get("/legacy-users/status", getLegacyUsersMigrationStatus);

module.exports = router;
