const UserDevice = require("../../models/UserDevice");

async function trackAuth(req, userId) {
  try {
    console.log("AMIR");
    console.log("AMIR");

    if (!userId) {
      return;
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      null;

    const userAgent = req.get("User-Agent") || null;

    let deviceType = "unknown";

    if (/mobile/i.test(userAgent)) {
      deviceType = "mobile";
    } else if (/tablet|ipad/i.test(userAgent)) {
      deviceType = "tablet";
    } else if (userAgent) {
      deviceType = "desktop";
    }

    let browser = "unknown";

    if (/edg/i.test(userAgent)) {
      browser = "Edge";
    } else if (/chrome/i.test(userAgent)) {
      browser = "Chrome";
    } else if (/firefox/i.test(userAgent)) {
      browser = "Firefox";
    } else if (/safari/i.test(userAgent)) {
      browser = "Safari";
    } else if (/opera|opr/i.test(userAgent)) {
      browser = "Opera";
    }

    let os = "unknown";

    if (/windows/i.test(userAgent)) {
      os = "Windows";
    } else if (/android/i.test(userAgent)) {
      os = "Android";
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
      os = "iOS";
    } else if (/macintosh|mac os/i.test(userAgent)) {
      os = "MacOS";
    } else if (/linux/i.test(userAgent)) {
      os = "Linux";
    }

    await UserDevice.create({
      user_id: userId,
      ip,
      user_agent: userAgent,
      device_type: deviceType,
      browser,
      os,
    });
  } catch (error) {
    console.error("Auth tracking error:", error);
  }
}

module.exports = trackAuth;
