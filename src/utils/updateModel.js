const updateModel = async ({ model, req, res }) => {
  const item = await model.findByPk(req?.params?.id);

  if (!item) {
    return res.status(400).json({
      message: "شناسه اشتباه است",
      data: null,
    });
  }

  item.update(req.body);

  return item;
};

module.exports = updateModel;
