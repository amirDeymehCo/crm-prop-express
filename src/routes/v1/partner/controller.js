const Controllers = require("../../controllers");

const {
  lookupRecoveryAccounts,
  createRecoveryOffer,
  getRecoveryOffer,
  cancelRecoveryOffer,
  retryPendingCallbacks,
} = require("../../../services/Recovery");

/**
 * API هایی که سرویس PHP صدا می‌زند.
 *
 * احراز هویت با هدر X-API-Key است (middlewares/authPartner).
 */
const Controller = class extends Controllers {
  /**
   * POST /api/v1/partner/recovery/accounts
   *
   * استعلام دسته‌ای: لیستی از mt_login می‌گیرد و برای هر کدام اطلاعات کاربر،
   * چالش، قیمت قبلی و فاکتور بازِ احتمالی را برمی‌گرداند.
   */
  async lookupAccounts(req, res) {
    const data = await lookupRecoveryAccounts({
      mt_logins: req.body.mt_logins,
    });

    return this.response({
      res,
      message: "لیست حساب‌های قابل بازیابی",
      data,
    });
  }

  /**
   * POST /api/v1/partner/recovery/offers
   *
   * ثبت مبلغ جدیدِ توافق‌شده و ساخت فاکتور بازیابی. اگر فاکتور پرداخت‌نشده‌ای
   * برای همین حساب باز باشد، باطل و با این یکی جایگزین می‌شود.
   */
  async createOffer(req, res) {
    try {
      const data = await createRecoveryOffer({
        mt_login: req.body.mt_login,
        offer_price_usd: req.body.offer_price_usd,
        external_ref: req.body.external_ref ?? null,
        agent: req.body.agent ?? null,
        note: req.body.note ?? null,
        expires_at: req.body.expires_at ?? null,
        payment_plan: req.body.payment_plan ?? null,
      });

      return this.response({
        res,
        status: 201,
        message: "فاکتور بازیابی ساخته شد",
        data,
      });
    } catch (err) {
      return this.response({
        res,
        status: err.status || 500,
        message: err.message || "خطای سرور",
        data: err.code ? { code: err.code, recovery_id: err.recovery_id } : null,
      });
    }
  }

  /**
   * GET /api/v1/partner/recovery/offers/:id
   * GET /api/v1/partner/recovery/offers?external_ref=...
   */
  async getOffer(req, res) {
    try {
      const data = await getRecoveryOffer({
        id: req.params.id ? Number(req.params.id) : null,
        external_ref: req.query.external_ref ?? null,
      });

      return this.response({ res, message: "وضعیت فاکتور بازیابی", data });
    } catch (err) {
      return this.response({
        res,
        status: err.status || 500,
        message: err.message || "خطای سرور",
        data: err.code ? { code: err.code } : null,
      });
    }
  }

  /**
   * POST /api/v1/partner/recovery/offers/:id/cancel
   */
  async cancelOffer(req, res) {
    try {
      const data = await cancelRecoveryOffer({
        id: Number(req.params.id),
        reason: req.body?.reason ?? null,
      });

      return this.response({ res, message: "فاکتور بازیابی باطل شد", data });
    } catch (err) {
      return this.response({
        res,
        status: err.status || 500,
        message: err.message || "خطای سرور",
        data: err.code ? { code: err.code } : null,
      });
    }
  }

  /**
   * POST /api/v1/partner/recovery/callbacks/retry
   *
   * ارسال دوباره‌ی اطلاع‌رسانی‌هایی که نرسیده‌اند — مخصوصاً برای وقتی که
   * سرویس PHP تازه بالا می‌آید و پرداخت‌هایی در این فاصله انجام شده.
   */
  async retryCallbacks(req, res) {
    const data = await retryPendingCallbacks({
      limit: Number(req.body?.limit) || 50,
    });

    return this.response({ res, message: "نتیجه ارسال مجدد", data });
  }
};

module.exports = new Controller();
