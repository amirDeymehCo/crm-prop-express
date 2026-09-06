const dayjs = require("dayjs");

/**
 * بازه‌ی زمانی گزارش‌ها.
 *
 * خروجی:
 *  - startDate / endDate : مرزهای بازه
 *  - format              : الگوی DATE_FORMAT مای‌اسکیوال برای گروه‌بندی نمودار
 *  - prevStartDate / prevEndDate : بازه‌ی قبلی با همان طول، برای محاسبه‌ی رشد
 *
 * مقادیر مجاز range:
 *  today | 7d | 1m (پیش‌فرض) | this_month | 3m | 6m | 1y
 */
function getRange(range = "1m") {
  const endDate = dayjs().endOf("day");

  let startDate;
  let format;

  switch (range) {
    case "today":
      startDate = dayjs().startOf("day");
      format = "%Y-%m-%d %H:00";
      break;

    case "7d":
      startDate = dayjs().subtract(7, "day").startOf("day");
      format = "%Y-%m-%d";
      break;

    case "this_month":
      startDate = dayjs().startOf("month");
      format = "%Y-%m-%d";
      break;

    case "3m":
      startDate = dayjs().subtract(3, "month").startOf("day");
      format = "%Y-%m";
      break;

    case "6m":
      startDate = dayjs().subtract(6, "month").startOf("day");
      format = "%Y-%m";
      break;

    case "1y":
      startDate = dayjs().subtract(1, "year").startOf("day");
      format = "%Y-%m";
      break;

    default:
      startDate = dayjs().subtract(1, "month").startOf("day");
      format = "%Y-%m-%d";
      break;
  }

  // بازه‌ی قبلی با همان طول، برای مقایسه و درصد رشد
  const lengthMs = endDate.valueOf() - startDate.valueOf();
  const prevEndDate = startDate.subtract(1, "millisecond");
  const prevStartDate = dayjs(prevEndDate.valueOf() - lengthMs);

  return {
    startDate: startDate.toDate(),
    endDate: endDate.toDate(),
    prevStartDate: prevStartDate.toDate(),
    prevEndDate: prevEndDate.toDate(),
    format,
  };
}

module.exports = getRange;
