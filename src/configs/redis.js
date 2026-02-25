const { createClient } = require("redis");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const client = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      // retry با backoff
      return Math.min(retries * 100, 3000);
    },
  },
});

client.on("connect", () => {
  console.log("✅ Redis connected");
});

client.on("ready", () => {
  console.log("🚀 Redis ready");
});

client.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

client.on("end", () => {
  console.log("⚠️ Redis connection closed");
});

// اتصال اتوماتیک
(async () => {
  if (!client.isOpen) {
    await client.connect();
  }
})();

module.exports = client;
