// middlewares/cleanQuery.js
module.exports = function cleanQuery(req, res, next) {
    const q = req.query || {};
    const cleaned = {};

    for (const [key, val] of Object.entries(q)) {
        // آرایه‌ها (مثل status[]=... )
        if (Array.isArray(val)) {
            const arr = val
                .map(v => (typeof v === "string" ? v.trim() : v))
                .filter(v => v !== "" && v !== null && v !== undefined)
                .filter(v => {
                    const s = String(v).toLowerCase();
                    return s !== "null" && s !== "undefined";
                });

            if (arr.length) cleaned[key] = arr;
            continue;
        }

        // تک مقدار
        if (val === null || val === undefined) continue;

        if (typeof val === "string") {
            const s = val.trim();
            const low = s.toLowerCase();
            if (!s || low === "null" || low === "undefined") continue;
            cleaned[key] = s;
            continue;
        }

        cleaned[key] = val;
    }

    req.query = cleaned;
    next();
};
