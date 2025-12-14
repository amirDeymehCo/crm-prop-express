function normalizeGatewayStatus(raw) {
    const s = String(raw || "").toUpperCase();
    if (s === "CONFIRMED" || s === "PAID" || s === "SUCCESS") return "confirmed";
    if (s === "FAILED") return "failed";
    if (s === "CANCELED" || s === "CANCELLED") return "cancelled";
    return "unknown";
}
module.exports = { normalizeGatewayStatus };
