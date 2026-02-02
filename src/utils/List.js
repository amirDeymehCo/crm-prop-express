const founcList = async (model, req, where = {}, otherProps = {}) => {
    const query = req?.query
    // paginations 
    const page = query?.page ? parseInt(query.page) : 1;
    const limit = query?.limit ? parseInt(query.limit) : 5;
    const offset = (page - 1) * limit;

    const result = await model.findAndCountAll({
        where,
        limit: limit,
        offset: offset,
        ...otherProps
    });

    const totalCount = result.count;
    const items = result.rows;

    const resData = {
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        items,
    };



    return resData
}


module.exports = founcList
