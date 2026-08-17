const founcList = async (model, req, where = {}, otherProps = {}) => {
  const query = req?.query || {};

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(query.limit, 10) || 25, 1);
  const offset = (page - 1) * limit;

  const result = await model.findAndCountAll({
    where,
    limit,
    offset,
    distinct: true,
    ...otherProps,
  });

  // وقتی group داریم، Sequelize یک آرایه از گروه‌ها برمی‌گرداند.
  const totalCount = Array.isArray(result.count)
    ? result.count.length
    : result.count;

  return {
    totalCount,
    currentPage: page,
    totalPages: Math.ceil(totalCount / limit),
    limit,
    items: result.rows,
  };
};

module.exports = founcList;
