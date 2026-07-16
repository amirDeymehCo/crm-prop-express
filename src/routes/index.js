const express = require("express");
const router = express.Router();
const serverError = require("../middlewares/error");
const v1Routes = require("./v1");
require("../models/Challenge/setupAssociations");

router.use("/v1", v1Routes);

router.use((req, res) => {
  res.status(404).json({ message: "آدرس مورد نظر پیدا نشد" });
});

router.use(serverError);
module.exports = router;

//// change
