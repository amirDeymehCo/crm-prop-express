// middlewares/error.js
module.exports = function (err, req, res, next) {
  console.error("🔴 Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message,
    error: err,
  });
};
