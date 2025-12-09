// middleware/can.js
function can(permission) {
    return (req, res, next) => {
        // super_admin همه کار میتونه بکنه
        if (req.admin?.is_super_admin) return next();

        if (!req.admin?.permissions?.includes(permission)) {
            return res.status(403).json({ message: "Permission denied" });
        }

        next();
    };
}

module.exports = can;
