const redis = require("../configs/redis");

function invalidateCache({ keyPrefix = "cache" } = {}) {
  return async function (req, res, next) {
    const methods = ["POST", "PUT", "PATCH", "DELETE"];
    if (!methods.includes(req.method)) return next();

    // مثال: همه کش‌های مربوط به این resource
    const pattern = `${keyPrefix}:*`;

    const keys = await redis.keys(pattern);
    if (keys.length) {
      await redis.del(keys);
    }

    next();
  };
}

module.exports = invalidateCache;
