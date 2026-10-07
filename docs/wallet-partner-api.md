# کم کردن موجودی ولت — مستندات API برای پنل PHP

این سند قرارداد بین CRM (Node/Express) و پنل PHP برای **کم کردن موجودی ولت
کاربر** است؛ مثلاً ورودیه‌ی شرکت در مسابقه.

دو حالت دارد:

| حالت | چه زمانی | رفتار |
| --- | --- | --- |
| **کسر قطعی** | `hold_minutes` را نفرستید | پول کم می‌شود و تمام |
| **رزرو موقت** | `hold_minutes` را بفرستید | پول همان لحظه کم می‌شود، ولی اگر تا پایان مهلت `settle` نشود **خودش به ولت کاربر برمی‌گردد** |

## احراز هویت

همه‌ی مسیرها با کلید ثابت در هدر محافظت می‌شوند:

```
X-API-Key: <PARTNER_API_KEY>
Content-Type: application/json
```

(هدر `Authorization: Bearer <key>` هم پذیرفته می‌شود.)

Base URL: `https://<crm-host>/api/v1/global`

---

## فلوی رزرو (مسابقه)

1. کاربر در مسابقه ثبت‌نام می‌کند → PHP `POST /decrementWallet` را با
   `hold_minutes` صدا می‌زند. پول کم می‌شود و یک `hold_id` با `expires_at`
   برمی‌گردد.
2. اگر شرکت در مسابقه نهایی شد (مثلاً حساب مسابقه ساخته شد) → PHP
   `POST /settleWalletHold` را صدا می‌زند. پول نهایی می‌شود و دیگر برنمی‌گردد.
3. اگر PHP خودش قبل از پایان مهلت لغو کرد → `POST /refundWalletHold`؛ پول
   بلافاصله برمی‌گردد.
4. اگر هیچ‌کدام از ۲ و ۳ اتفاق نیفتاد → کرون سمت ما (هر دقیقه) بعد از
   `expires_at` پول را به ولت کاربر برمی‌گرداند و وضعیت رزرو `expired` می‌شود.

> **مهم:** اگر `settleWalletHold` را صدا نزنید، پول **برمی‌گردد**. رزرو
> «تایید نشده» از نظر سیستم یعنی مسابقه سر نگرفته.

---

## ۱) کسر موجودی / رزرو

```
POST /decrementWallet
```

```json
{
  "user_id": 123,
  "amount": 50,
  "hold_minutes": 60,
  "reason": "competition",
  "reference_id": "contest-7-user123",
  "description": "ورودیه مسابقه مهر"
}
```

| فیلد | اجباری | توضیح |
| --- | --- | --- |
| `user_id` | ✅ | شناسه‌ی کاربر سمت ما (عدد صحیح مثبت) |
| `amount` | ✅ | مبلغ دلاری؛ عدد مثبت |
| `hold_minutes` | ❌ | مهلت رزرو به دقیقه (حداکثر `43200` = ۳۰ روز). نفرستید ⇒ کسر قطعی |
| `reason` | ❌ | پیش‌فرض `competition`. در لاگ تراکنش ثبت می‌شود |
| `reference_id` | ❌ ولی **توصیه‌ی جدی** | شناسه‌ی یکتای سمت شما؛ درخواست را idempotent می‌کند |
| `description` | ❌ | متن دلخواه برای لاگ؛ ندهید خودش بر اساس `reason` متن فارسی می‌گذارد |

پاسخ موفق (حالت رزرو):

```json
{
  "message": "مبلغ کم و تا پایان مهلت رزرو شد",
  "data": {
    "hold_id": 41,
    "status": "held",
    "amount": 50,
    "reason": "competition",
    "reference_id": "contest-7-user123",
    "expires_at": "2026-10-07T12:30:00.000Z",
    "settled_at": null,
    "released_at": null,
    "transaction_id": 9120,
    "refund_transaction_id": null,
    "balance": 150
  }
}
```

در حالت کسر قطعی `hold_id` برابر `null` و `status` برابر `"settled"` است.

اگر همان `reference_id` دوباره فرستاده شود، پول **دوباره کم نمی‌شود** و همان
نتیجه با `"duplicate": true` برمی‌گردد.

خطاها:

| کد | حالت |
| --- | --- |
| `400` | `user_id` / `amount` / `hold_minutes` نامعتبر، یا موجودی ولت کافی نیست |
| `401` | کلید اشتباه |
| `404` | کاربر ولت ندارد |
| `503` | `PARTNER_API_KEY` سمت ما ست نشده |

---

## ۲) تایید نهایی رزرو

```
POST /settleWalletHold
{ "hold_id": 41 }
```

یا با `{ "reference_id": "contest-7-user123" }`.

پاسخ: همان ساختار رزرو با `status: "settled"` و `settled_at` پر شده.

- `settle` تکراری خطا نیست؛ همان نتیجه با `duplicate: true` برمی‌گردد.
- اگر رزرو قبلاً برگشت خورده باشد → `409`.

---

## ۳) برگشت دستی وجه

```
POST /refundWalletHold
{ "hold_id": 41 }
```

پول بلافاصله به ولت برمی‌گردد، `status` می‌شود `refunded`.

- تکراری خطا نیست (`duplicate: true`).
- اگر رزرو قبلاً `settled` شده باشد → `409` (برای برگشت پولِ نهایی‌شده باید
  ادمین دستی واریز کند).

---

## ۴) استعلام وضعیت رزرو

```
GET /walletHold/41
GET /walletHold?reference_id=contest-7-user123
```

`status` یکی از این‌هاست:

| مقدار | معنی |
| --- | --- |
| `held` | پول کم شده، منتظر تایید یا انقضا |
| `settled` | تایید شد؛ پول نهایی است |
| `refunded` | پارتنر قبل از انقضا لغو کرد؛ پول برگشت |
| `expired` | مهلت تمام شد و کرون پول را برگرداند |

---

## لاگ تراکنش‌ها

هر کسر و هر برگشت یک ردیف در `wallet_transactions` می‌سازد، پس در پنل کاربر و
پنل ادمین قابل پیگیری است:

- کسر: `type=adjustment`، `description` مثل «کاهش موجودی بابت شرکت در مسابقه
  (رزرو تا …)»، `meta.direction=decrement`
- برگشت: `type=adjustment`، `description` مثل «برگشت وجه؛ مهلت … تمام شد»،
  `meta.direction=increment`، `meta.refund_of_hold_id` و `meta.cause`
  (`expired` یا `manual`)

`meta` همیشه شامل `via=partner_api`، `partner`، `reason` و `user_id` است.

---

## راه‌اندازی سمت ما (DevOps)

۱) کرون باید فعال باشد، وگرنه پول رزروها هرگز برنمی‌گردد:

```
ENABLE_CRONS=true
PARTNER_API_KEY=<کلید>
```

۲) جدول `wallet_holds` باید ساخته شود. در dev با `DB_SYNC=true` خودش ساخته
می‌شود؛ در production (که sync خاموش است) این SQL را اجرا کنید:

```sql
CREATE TABLE `wallet_holds` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `amount` DECIMAL(18,4) NOT NULL,
  `status` ENUM('held','settled','refunded','expired') NOT NULL DEFAULT 'held',
  `reason` VARCHAR(50) NOT NULL DEFAULT 'competition',
  `description` MEDIUMTEXT NULL,
  `reference_id` VARCHAR(191) NULL,
  `expires_at` DATETIME NOT NULL,
  `settled_at` DATETIME NULL,
  `released_at` DATETIME NULL,
  `debit_transaction_id` INT NULL,
  `refund_transaction_id` INT NULL,
  `partner` VARCHAR(50) NULL,
  `user_id` INT NOT NULL,
  `wallet_id` INT NOT NULL,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallet_holds_reference_id` (`reference_id`),
  KEY `wallet_holds_status_expires_at` (`status`, `expires_at`),
  KEY `wallet_holds_user_id` (`user_id`),
  CONSTRAINT `wallet_holds_wallet_id_fk` FOREIGN KEY (`wallet_id`)
    REFERENCES `wallets` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `wallet_holds_user_id_fk` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

۳) چون انقضا با کرون درون‌پروسسی کار می‌کند، اگر روزی اپ را چند instance کردید
این کرون باید فقط روی یکی روشن باشد (یا با قفل دیتابیسی محافظت شود) — در غیر
این صورت دو instance سراغ یک رزرو می‌روند. (ردیف داخل transaction قفل می‌شود،
پس برگشت دوباره نمی‌خورد، ولی کوئری اضافه می‌زند.)
