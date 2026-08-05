const dayjs = require("dayjs");

function getRange(range = "1m") {
  const endDate = dayjs().endOf("day");

  let startDate;
  let format;

  switch (range) {
    case "3m":
      startDate = dayjs().subtract(3, "month").startOf("day");
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

  return {
    startDate: startDate.toDate(),
    endDate: endDate.toDate(),
    format,
  };
}

module.exports = getRange;
