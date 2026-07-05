// middleware/can.js
function can(permission) {
  return (req, res, next) => {
    if (req.admin?.is_super_admin) return next();

    if (!req.admin?.permissions?.includes(permission)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    return next();
  };
}

module.exports = can;
