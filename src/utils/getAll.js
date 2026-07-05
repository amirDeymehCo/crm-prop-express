const { Op } = require("sequelize");

const getAll = async ({
  model,
  req,
  filtersArr = [{ field: "title", type: "like" }],
  otherProps = {},
}) => {
  const query = req.query;
  let filters = {};

  const dialect = "mysql";

  // پردازش فیلترها بر اساس پیکربندی
  for (const filter of filtersArr) {
    const { field, type } = filter;
    if (query[field]) {
      switch (type) {
        case "like":
          filters[field] =
            dialect === "mysql" || dialect === "mariadb"
              ? { [Op.like]: `%${query[field]}%` } // برای MySQL/MariaDB
              : { [Op.iLike]: `%${query[field]}%` }; // برای PostgreSQL
          break;
        case "equal":
          filters[field] = query[field]; // برابر با
          break;
        case "in":
          filters[field] = { [Op.in]: query[field].split(",") }; // مقادیر درون آرایه
          break;
        case "between":
          const [start, end] = query[field].split(",").map(Number); // مقادیر شروع و پایان
          filters[field] = { [Op.between]: [start, end] };
          break;
        case "gt":
          filters[field] = { [Op.gt]: query[field] }; // بزرگتر از
          break;
        case "gte":
          filters[field] = { [Op.gte]: query[field] }; // بزرگتر یا مساوی
          break;
        case "lt":
          filters[field] = { [Op.lt]: query[field] }; // کوچکتر از
          break;
        case "lte":
          filters[field] = { [Op.lte]: query[field] }; // کوچکتر یا مساوی
          break;
        default:
          break;
      }
    }
  }

  // مدیریت صفحه‌بندی

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const result = await model.findAndCountAll({
    where: filters,
    limit: limit,
    offset: offset,
    ...otherProps,
  });

  const totalCount = result.count;
  const items = result.rows;

  const resData = {
    totalCount,
    currentPage: page,
    totalPages: Math.ceil(totalCount / limit),
    items,
  };

  // ارسال پاسخ

  return resData;
};

module.exports = getAll;
