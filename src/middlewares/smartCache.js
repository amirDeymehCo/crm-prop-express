const redis = require("../configs/redis");

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function smartCache(defaults = {}) {
  const { ttl = 60, keyPrefix = "cache" } = defaults;

  return async function (req, res, next) {
    const method = req.method;

    // مقدار پیش‌فرض
    req.cache = {
      enabled: true,
      ttl,
      key: null,
      tags: [],
    };

    // ===============================
    // WRITE → invalidate
    // ===============================
    if (WRITE_METHODS.includes(method)) {
      res.on("finish", async () => {
        // فقط اگه request موفق بوده
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const pattern = `${keyPrefix}:*`;
          const keys = await redis.keys(pattern);
          if (keys.length) await redis.del(keys);
        }
      });

      return next();
    }

    // ===============================
    // فقط GET کش میشه
    // ===============================
    if (method !== "GET") return next();

    // کش غیرفعال شده؟
    if (req.cache.enabled === false) return next();

    const cacheKey = req.cache.key || `${keyPrefix}:${req.originalUrl}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      // override res.json
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        redis.setEx(cacheKey, req.cache.ttl, JSON.stringify(body));
        return originalJson(body);
      };

      next();
    } catch (err) {
      next(); // اگر Redis down بود اپ نخوابه
    }
  };
}

module.exports = smartCache;
