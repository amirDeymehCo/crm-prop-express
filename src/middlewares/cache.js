const redis = require("../configs/redis"); // client

function cache({ ttl = 60, keyPrefix = "cache", unless } = {}) {
  return async function (req, res, next) {
    // فقط GET
    if (req.method !== "GET") return next();

    // شرط عدم کش
    if (unless && unless(req)) return next();

    const key = `${keyPrefix}:${req.originalUrl}`;

    const cached = await redis.get(key);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // override res.json
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      redis.setex(key, ttl, JSON.stringify(body));
      return originalJson(body);
    };

    next();
  };
}

module.exports = cache;
