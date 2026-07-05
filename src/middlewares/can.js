// middleware/can.js
function can(permission) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.admin.is_super_admin) {
      return next();
    }

    if (permission === "JUST_SUPER") {
      return res.status(403).json({ message: "Permission denied" });
    }

    console.log(permission);
    console.log(req.admin.permissions);

    if (!req.admin.permissions || !req.admin.permissions.includes(permission)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    return next();
  };
}

module.exports = can;
