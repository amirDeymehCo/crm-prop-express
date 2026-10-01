# بازیابی حساب — مستندات API برای پنل PHP

این سند قراردادِ بین CRM جدید (Node/Express) و پنل PHP برای فلوی «بازیابی حساب» است.

## خلاصه‌ی فلو

1. تیم فروش لیست حساب‌های fail شده را دارد. پنل PHP لیست `mt_login` را به
   **API ۱** می‌دهد و اطلاعات کاربر، چالش و قیمت قبلی را می‌گیرد.
2. کارشناس با کاربر تماس می‌گیرد و روی یک مبلغ توافق می‌کند. ادمین مبلغ را در
   پنل PHP ثبت می‌کند و پنل **API ۲** را صدا می‌زند → یک فاکتور بازیابی ساخته می‌شود.
3. کاربر وارد پنل خودش (سمت ما) می‌شود، در لیست چالش‌ها دکمه‌ی «بازیابی حساب»
   را می‌بیند و مبلغ را پرداخت می‌کند.
4. بعد از پرداخت موفق، **همان حساب قبلی با همان `mt_login`** احیا می‌شود و چالش
   به همان فازی که در آن رد شده بود برمی‌گردد.
5. بلافاصله بعد از آن، ما **API ۳** (که PHP باید بدهد) را صدا می‌زنیم تا شما
   ریست حساب را سمت پلتفرم معاملاتی انجام دهید.

> ⚠️ آدرس API ۳ هنوز نرسیده. تا وقتی `PHP_RECOVERY_CALLBACK_URL` ست نشده باشد،
> پرداخت‌ها کامل انجام می‌شوند و اطلاع‌رسانی‌ها در صف می‌مانند؛ بعداً با یک
> درخواست (`/recovery/callbacks/retry`) همه‌شان ارسال می‌شوند.

---

## احراز هویت

همه‌ی مسیرهای `/api/v1/partner/*` با یک کلید ثابت در هدر محافظت می‌شوند:

```
X-API-Key: <PARTNER_API_KEY>
Content-Type: application/json
```

(هدر `Authorization: Bearer <key>` هم پذیرفته می‌شود.)

کلید در `.env` سمت ما با نام `PARTNER_API_KEY` ست می‌شود. ساختنش:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

کلید نامعتبر → `401`. اگر کلید اصلاً روی سرور ست نشده باشد → `503`.

**نرخ درخواست:** ۶۰۰ درخواست در هر ۵ دقیقه برای هر IP (قابل تنظیم با
`PARTNER_RATE_LIMIT`). سقف عمومی سایت روی این مسیر اعمال نمی‌شود.

### قالب پاسخ

همه‌ی پاسخ‌ها این شکل‌اند:

```json
{ "message": "متن فارسی", "data": { } }
```

خطاها همین قالب را دارند با کد وضعیت HTTP مناسب و `data.code` ماشین‌خوان.

---

## API ۱ — استعلام دسته‌ای حساب‌ها

```
POST /api/v1/partner/recovery/accounts
```

**درخواست**

```json
{ "mt_logins": ["520114", "520115", "520116"] }
```

- حداکثر **۲۰۰** لاگین در هر درخواست. بیشتر از آن → `400`.
- هم `mt_login` و هم `platform_login` چک می‌شوند (حساب‌های cTrader).
- لاگین‌های تکراری حذف می‌شوند.

**پاسخ `200`**

```json
{
  "message": "لیست حساب‌های قابل بازیابی",
  "data": {
    "requested": 3,
    "found": 2,
    "eligible": 1,
    "items": [
      {
        "mt_login": "520114",
        "found": true,
        "eligible": true,
        "reason": null,
        "user": {
          "id": 412,
          "full_name": "علی رضایی",
          "mobile": "09120000000",
          "email": "ali@example.com",
          "legacy_user_id": "8731"
        },
        "challenge": {
          "id": 1902,
          "status": "closed",
          "phase_index": 2,
          "platform": "ctrader",
          "plan_title": "استاندارد ۱۰ هزار دلاری",
          "plan_balance_usd": 10000,
          "challenge_type": "استاندارد",
          "payment_plan": "installment",
          "closed_at": "2026-09-21T10:14:00.000Z"
        },
        "account": {
          "id": 3301,
          "status": "failed",
          "mt_server": "MyProp-Live",
          "starting_balance_usd": 10000
        },
        "pricing": {
          "original_price_usd": 10,
          "price_source": "rules_snapshot",
          "insurance_fee_usd": 3,
          "floating_risk_fee_usd": 0,
          "list_total_usd": 13,
          "paid_total_usd": 6.5,
          "paid_source": "orders",
          "last_paid_amount_usd": 3.25,
          "last_paid_at": "2026-08-02T08:00:00.000Z",
          "is_estimated": false,
          "balance_usd": 10000,
          "pricing_plan_id": 4
        },
        "open_recovery": null
      },
      {
        "mt_login": "520115",
        "found": true,
        "eligible": false,
        "reason": "challenge_not_closed",
        "...": "بقیه‌ی فیلدها مثل بالا"
      },
      {
        "mt_login": "520116",
        "found": false,
        "eligible": false,
        "reason": "account_not_found"
      }
    ]
  }
}
```

**کدهای `reason`**

| کد | معنی |
|---|---|
| `account_not_found` | لاگینی با این شماره در سیستم ما نیست |
| `challenge_not_found` | حساب هست ولی به چالشی وصل نیست |
| `challenge_not_closed` | چالش رد نشده (هنوز فعال است) — قابل بازیابی نیست |
| `recovery_in_progress` | فاکتور بازیابیِ نیمه‌پرداخت دارد؛ تا تسویه نشود فاکتور جدید نمی‌شود ساخت |

**نکته‌های مهم**

- خروجی عمداً سبک است (بدون `rules_snapshot` و بدون تاریخچه) چون روی لیست‌های
  چندصدتایی صدا زده می‌شود. اگر فیلد دیگری لازم داشتید بگویید اضافه کنیم.
### بلوک `pricing` — مهم

بخشی از چالش‌ها دستی از سیستم قبلی وارد شده‌اند و سفارششان با مبلغ صفر ثبت شده.
برای آن‌ها هیچ رکورد پرداخت واقعی وجود ندارد، پس قیمت از روی **پلن + تایپ + بالانسِ
حساب** بازسازی می‌شود تا کارشناس فروش هیچ‌وقت عدد صفر نبیند.

| فیلد | معنی |
|---|---|
| `original_price_usd` | قیمت پایه‌ی پلن — **همان عددی که باید روی آن تخفیف داد** |
| `price_source` | این قیمت از کجا آمده (جدول پایین) |
| `insurance_fee_usd` | حق بیمه‌ی این چالش (۰ اگر بیمه نداشته) |
| `floating_risk_fee_usd` | هزینه‌ی ریسک شناور (فقط وقتی کاربر آن را خاموش کرده باشد) |
| `list_total_usd` | **کل مبلغی که این چالش در می‌آید** = پایه + بیمه + ریسک شناور |
| `paid_total_usd` | مجموع پرداخت‌های واقعی برای خرید اصلی |
| `paid_source` | `orders` \| `challenge_row` \| `none` |
| `last_paid_amount_usd` | آخرین فاکتور پرداخت‌شده (`null` اگر نبوده) |
| `is_estimated` | **`true` یعنی هیچ پرداخت واقعی پیدا نشد** و عددها از پلن بازسازی شده‌اند |
| `balance_usd` | بالانسی که قیمت بر اساس آن حساب شده |
| `pricing_plan_id` | پلنی که برای محاسبه استفاده شد (ممکن است با `challenge_plan_id` فرق کند) |

**مقادیر `price_source` به ترتیب اولویت:**

| مقدار | معنی | اتکا |
|---|---|---|
| `rules_snapshot` | اسنپ‌شات لحظه‌ی خرید روی خود چالش | دقیق‌ترین |
| `plan` | قیمت فعلی پلنِ متصل به چالش | خوب |
| `plan_by_type_balance` | پلن از روی `challenge_type_id` + بالانس حساب پیدا شد — **حالت سفارش‌های دستی** | محاسبه‌شده |
| `challenge_row` | ستون `price_usd` خود چالش (فقط خرید یکجا) | ضعیف |
| `unknown` | هیچ منبعی نبود؛ `original_price_usd` صفر است | قیمت دستی بدهید |

**چند نکته‌ی ریز ولی مهم:**

- `original_price_usd` قیمت **پایه** است، بدون بیمه. اگر می‌خواهید بگویید «قبلاً
  چقدر داده بود»، `list_total_usd` یا `paid_total_usd` را نگاه کنید نه این را.
- وقتی `price_source` برابر `challenge_row` است فقط برای خرید یکجا برگردانده
  می‌شود؛ در خرید قسطی این ستون مبلغ **قسط اول** را نگه می‌دارد نه کل قیمت، پس
  عمداً استفاده نمی‌شود و به جایش `unknown` برمی‌گردد.
- `paid_total_usd` سفارش‌های خودِ **بازیابی** را حساب نمی‌کند، تا مبنای تخفیف
  همان خرید اصلی بماند.
- سفارش‌های دستی اغلب `final_amount_usd = 0` دارند ولی مبلغ واقعی در
  `amount_usd` مانده؛ این حالت تشخیص داده و درست جمع زده می‌شود. در عوض سفارشِ
  رایگانِ واقعی (کوپن ۱۰۰٪) همان صفر می‌ماند.
- اگر `is_estimated: true` بود یعنی این کاربر عملاً رکورد پرداختی ندارد — خوب است
  در پنل فروش با یک نشانه مشخص شود تا کارشناس بداند عدد تخمینی است.
- ترتیب `items` دقیقاً همان ترتیب `mt_logins` ارسالی است.

---

## API ۲ — ثبت مبلغ و ساخت فاکتور بازیابی

```
POST /api/v1/partner/recovery/offers
```

**درخواست**

```json
{
  "mt_login": "520114",
  "offer_price_usd": 7,
  "external_ref": "php-offer-991",
  "agent": "سلیمانی",
  "note": "تماس ۱۴۰۵/۰۷/۰۹ — مشتری موافقت کرد",
  "expires_at": "2026-10-15T00:00:00Z",
  "payment_plan": null
}
```

| فیلد | اجباری | توضیح |
|---|---|---|
| `mt_login` | ✅ | لاگین حسابی که fail شده |
| `offer_price_usd` | ✅ | **کل** مبلغ قابل پرداخت به دلار، بزرگ‌تر از صفر |
| `external_ref` | ❌ | شناسه‌ی همین پیشنهاد در سیستم شما؛ بعداً می‌توانید با آن وضعیت را بخوانید |
| `agent` | ❌ | نام کارشناس فروش — در تاریخچه‌ی چالش ثبت می‌شود |
| `note` | ❌ | یادداشت آزاد |
| `expires_at` | ❌ | ISO 8601. بعد از این تاریخ کاربر نمی‌تواند پرداخت کند |
| `payment_plan` | ❌ | `full` یا `installment`. **اگر نفرستید از چالش قبلی ارث می‌برد** |

**پاسخ `201`**

```json
{
  "message": "فاکتور بازیابی ساخته شد",
  "data": {
    "recovery_id": 14,
    "user_challenge_id": 1902,
    "user_id": 412,
    "mt_login": "520114",
    "phase_index": 2,
    "status": "pending_payment",
    "payment_plan": "installment",
    "previous_price_usd": 10,
    "previous_price_source": "rules_snapshot",
    "previous_list_total_usd": 13,
    "previous_paid_total_usd": 13,
    "previous_price_is_estimated": false,
    "offer_price_usd": 7,
    "offer_price_irr": 6300000,
    "first_amount_usd": 3.5,
    "second_amount_usd": 3.5,
    "expires_at": "2026-10-15T00:00:00.000Z",
    "external_ref": "php-offer-991",
    "cancelled_recovery_ids": [11],
    "order": {
      "id": 8842,
      "gateway_order_id": "recovery-14-1-1790000000000",
      "amount_usd": 3.5,
      "amount_irr": 3150000
    }
  }
}
```

**رفتار در حالت‌های خاص**

- اگر برای همین حساب فاکتور **پرداخت‌نشده‌ای** باز باشد، باطل می‌شود و id آن در
  `cancelled_recovery_ids` برمی‌گردد. (یعنی برای تغییر قیمت از ۷ به ۵ دلار کافی
  است دوباره همین API را صدا بزنید.)
- اگر فاکتور **نیمه‌پرداخت** باشد (قسط اول داده شده و حساب احیا شده) →
  `409` با `code: "recovery_in_progress"`.
- اگر چالش `closed` نباشد → `409` با `code: "challenge_not_closed"`.
- اگر لاگین پیدا نشود → `404` با `code: "account_not_found"`.

`previous_*` ها همان اعداد بلوک `pricing` در API ۱ هستند که در لحظه‌ی ساخت
فاکتور قفل می‌شوند؛ برای سفارش‌های دستی هم محاسبه می‌شوند و روی رکورد بازیابی
ذخیره می‌مانند تا بعداً بشود فهمید تخفیف روی چه مبنایی داده شده.

**درباره‌ی اقساط**

اگر `payment_plan` نهایی `installment` شود، مبلغ دقیقاً نصف‌نصف می‌شود
(۷ → ۳٫۵ + ۳٫۵) و فقط فاکتور **قسط اول** همین الان ساخته می‌شود. فاکتور قسط دوم
به‌صورت خودکار بعد از پرداخت قسط اول ساخته می‌شود.

**حساب با پرداخت قسط اول احیا می‌شود** (همان رفتار خرید عادی چالش).
اگر این را نمی‌خواهید، در `src/services/Recovery/constants.js` مقدار
`REVIVE_ON_FIRST_INSTALLMENT` را `false` کنید تا احیا فقط بعد از تسویه‌ی کامل
انجام شود.

**تبدیل دلار به ریال** با فرمول همیشگی سیستم انجام می‌شود:
`usd × (dollar_price + bonus_dollar) × 10`. نرخ لحظه‌ی ساخت فاکتور قفل می‌شود.

---

## API ۲٫۱ — خواندن وضعیت فاکتور

```
GET /api/v1/partner/recovery/offers/{recovery_id}
GET /api/v1/partner/recovery/offers?external_ref=php-offer-991
```

**پاسخ `200`**

```json
{
  "message": "وضعیت فاکتور بازیابی",
  "data": {
    "recovery_id": 14,
    "status": "partially_paid",
    "payment_plan": "installment",
    "offer_price_usd": 7,
    "paid_amount_usd": 3.5,
    "remaining_amount_usd": 3.5,
    "first_paid_at": "2026-10-02T09:12:00.000Z",
    "second_paid_at": null,
    "revived_at": "2026-10-02T09:12:00.000Z",
    "callback_status": "sent",
    "callback_attempts": 1,
    "callback_last_error": null,
    "orders": [
      { "id": 8842, "installment_number": 1, "amount_usd": 3.5, "status": "paid", "gateway": "peykan", "paid_at": "..." },
      { "id": 8851, "installment_number": 2, "amount_usd": 3.5, "status": "pending", "gateway": "peykan", "paid_at": null }
    ]
  }
}
```

**مقادیر `status`**

| مقدار | معنی |
|---|---|
| `pending_payment` | ساخته شده، هنوز هیچ پولی پرداخت نشده |
| `partially_paid` | قسط اول پرداخت شده، حساب احیا شده، قسط دوم مانده |
| `paid` | تسویه کامل |
| `cancelled` | باطل شده (دستی یا با فاکتور جدید جایگزین شده) |
| `expired` | مهلت تمام شده |

---

## API ۲٫۲ — ابطال فاکتور

```
POST /api/v1/partner/recovery/offers/{recovery_id}/cancel
```

```json
{ "reason": "مشتری منصرف شد" }
```

فقط فاکتور `pending_payment` قابل ابطال است. فاکتوری که پولی رویش پرداخت شده →
`409` با `code: "recovery_not_cancellable"`. ابطال دوباره‌ی یک فاکتور باطل‌شده
خطا نمی‌دهد (idempotent).

---

## API ۳ — چیزی که **شما** باید بدهید

بعد از پرداخت موفق و احیای حساب، ما این درخواست را به آدرسی که بدهید می‌فرستیم:

```
POST <PHP_RECOVERY_CALLBACK_URL>
X-API-Key: <PHP_RECOVERY_API_KEY>
Content-Type: application/json
```

```json
{
  "event": "challenge_recovery_paid",
  "recovery_id": 14,
  "external_ref": "php-offer-991",

  "mt_login": "520114",
  "platform": "ctrader",
  "mt_server": "MyProp-Live",
  "mt_group": "real\\MyProp\\P2",

  "user_challenge_id": 1902,
  "account_instance_id": 3301,

  "phase_index": 2,
  "starting_balance_usd": 10000,

  "user": {
    "id": 412,
    "full_name": "علی رضایی",
    "mobile": "09120000000",
    "email": "ali@example.com",
    "legacy_user_id": "8731"
  },

  "payment": {
    "payment_plan": "installment",
    "offer_price_usd": 7,
    "paid_amount_usd": 3.5,
    "fully_paid": false,
    "first_paid_at": "2026-10-02T09:12:00.000Z",
    "second_paid_at": null
  },

  "revived_at": "2026-10-02T09:12:00.000Z",
  "sent_at": "2026-10-02T09:12:01.000Z"
}
```

**انتظار ما از پاسخ شما**

- کد `2xx` یعنی گرفتید. اگر بدنه‌ی JSON برگردانید و `ok` در آن `false` باشد،
  ناموفق حساب می‌شود و دوباره تلاش می‌کنیم.
- هر کد دیگری → `callback_status` روی `failed` می‌رود و قابل ارسال مجدد است.
- **حتماً idempotent باشد**: ممکن است یک `recovery_id` دوبار برسد.

**کاری که سمت شما باید انجام شود:** ریست حساب `mt_login` روی پلتفرم معاملاتی به
`starting_balance_usd` و فعال کردن آن در گروه `phase_index`.

اگر ساختار بدنه را طور دیگری می‌خواهید، فقط تابع `buildPayload` در
`src/services/Recovery/notifyPhp.js` باید عوض شود.

### ⚠️ نکته‌ی باز درباره‌ی اقساط

این اطلاع‌رسانی **یک بار** و در لحطه‌ی احیای حساب ارسال می‌شود (یعنی با
پرداخت قسط اول)، چون ریست حساب هم فقط یک بار لازم است. **پرداخت قسط دوم
رویداد جداگانه‌ای نمی‌فرستد.** برای فهمیدن اینکه تسویه کامل شده یا نه،
`GET /recovery/offers/{id}` را بخوانید (فیلد `status` برابر `paid`).

اگر برای حسابداری لازم دارید قسط دوم هم یک رویداد بدهد، بگویید تا اضافه کنیم.

### ارسال مجدد

```
POST /api/v1/partner/recovery/callbacks/retry
{ "limit": 50 }
```

هر بازیابیِ احیاشده‌ای که `callback_status` آن `pending` یا `failed` است را
دوباره می‌فرستد. **وقتی API خودتان بالا آمد و آدرسش را به ما دادید، یک بار این
را صدا بزنید** تا پرداخت‌های انجام‌شده در فاصله‌ی بین راه‌اندازی به شما برسد.

---

## سمت کاربر (برای اطلاع — ربطی به PHP ندارد)

| مسیر | کار |
|---|---|
| `GET /api/v1/user/challenge/user-challenges` | لیست چالش‌ها — هر آیتم یک فیلد `recovery` دارد (یا `null`) |
| `GET /api/v1/user/challenge/user-challenges/:id` | جزئیات چالش — همین فیلد `recovery` |
| `GET /api/v1/user/challenge/recovery-offers` | فاکتورهای بازِ کاربر لاگین‌کرده (لیست مستقل) |
| `POST /api/v1/user/challenge/pay-recovery` | `{ recovery_id, gateway }` با `gateway` از `wallet` \| `peykan` \| `nowpayments` |
| `GET\|POST /api/v1/global/callback-peykan-recovery` | کال‌بک درگاه پیکان مخصوص بازیابی |

فیلد `recovery` که روی لیست چالش‌ها می‌نشیند:

```json
{
  "recovery_id": 14,
  "status": "pending_payment",
  "mt_login": "520114",
  "phase_index": 2,
  "payment_plan": "installment",
  "offer_price_usd": 7,
  "paid_amount_usd": 0,
  "remaining_amount_usd": 7,
  "expires_at": null,
  "payable_order": {
    "id": 8842,
    "installment_number": 1,
    "amount_usd": 3.5,
    "amount_irr": 3150000
  }
}
```

---

## تنظیمات `.env`

```ini
PARTNER_API_KEY=            # کلیدی که PHP در X-API-Key می‌فرستد
PARTNER_RATE_LIMIT=600

CRM_API_BASE_URL=https://api-crm.myprop.trade/api/v1

PHP_RECOVERY_CALLBACK_URL=  # API ای که PHP می‌دهد (هنوز خالی)
PHP_RECOVERY_API_KEY=
PHP_RECOVERY_TIMEOUT=15000
```

---

## تغییرات دیتابیس

در dev با `DB_SYNC=true` خودکار اعمال می‌شود. روی production این‌ها را دستی بزنید:

```sql
CREATE TABLE IF NOT EXISTS `challenge_recoveries` (
  `id` INTEGER NOT NULL auto_increment,
  `user_id` INTEGER NOT NULL,
  `user_challenge_id` INTEGER NOT NULL,
  `account_instance_id` INTEGER,
  `mt_login` VARCHAR(255),
  `phase_index` INTEGER NOT NULL DEFAULT 1,
  `status` ENUM('pending_payment','partially_paid','paid','cancelled','expired') NOT NULL DEFAULT 'pending_payment',
  `payment_plan` ENUM('full','installment') NOT NULL DEFAULT 'full',
  `previous_price_usd` DECIMAL(18,2),
  `offer_price_usd` DECIMAL(18,2) NOT NULL,
  `offer_price_irr` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `first_amount_usd` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `first_amount_irr` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `second_amount_usd` DECIMAL(18,2),
  `second_amount_irr` DECIMAL(18,2),
  `paid_amount_usd` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `order_group_id` CHAR(36) BINARY,
  `external_ref` VARCHAR(255),
  `agent_label` VARCHAR(255),
  `note` TEXT,
  `expires_at` DATETIME,
  `first_paid_at` DATETIME,
  `second_paid_at` DATETIME,
  `paid_at` DATETIME,
  `cancelled_at` DATETIME,
  `revived_at` DATETIME,
  `callback_status` ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `callback_attempts` INTEGER NOT NULL DEFAULT 0,
  `callback_last_error` TEXT,
  `callback_sent_at` DATETIME,
  `meta` JSON,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `cr_user_id` (`user_id`),
  KEY `cr_user_challenge_id` (`user_challenge_id`),
  KEY `cr_account_instance_id` (`account_instance_id`),
  KEY `cr_mt_login` (`mt_login`),
  KEY `cr_status` (`status`),
  KEY `cr_callback_status` (`callback_status`),
  KEY `cr_challenge_status` (`user_challenge_id`,`status`)
) ENGINE=InnoDB;

ALTER TABLE `orders`
  MODIFY `type` ENUM(
    'challenge_purchase',
    'challenge_purchase_wallet',
    'wallet_deposit',
    'wallet_withdraw',
    'challenge_insurance_repurchase',
    'challenge_recovery'
  ) NOT NULL;

ALTER TABLE `history_challenge`
  MODIFY `type` ENUM(
    'change_status',
    'change_risk',
    'challenge_rejected',
    'insurance_paid',
    'insurance_paid_phase2',
    'insurance_paid_phase3',
    'recovery_offer_created',
    'recovery_offer_cancelled',
    'recovery_paid'
  );
```

---

## نمونه‌ی PHP

```php
<?php
$base = 'https://api-crm.myprop.trade/api/v1/partner';
$key  = getenv('MYPROP_CRM_API_KEY');

function crmPost(string $url, array $body, string $key): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-API-Key: ' . $key,
        ],
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]);

    $raw    = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $status, 'body' => json_decode($raw, true)];
}

// ۱) استعلام دسته‌ای
$res = crmPost("$base/recovery/accounts", [
    'mt_logins' => ['520114', '520115'],
], $key);

foreach ($res['body']['data']['items'] as $item) {
    if (!$item['eligible']) continue;
    // نمایش به کارشناس فروش
}

// ۲) ثبت قیمت توافق‌شده
$res = crmPost("$base/recovery/offers", [
    'mt_login'        => '520114',
    'offer_price_usd' => 7,
    'external_ref'    => 'php-offer-991',
    'agent'           => 'سلیمانی',
], $key);

if ($res['status'] === 201) {
    $recoveryId = $res['body']['data']['recovery_id'];
}
```
