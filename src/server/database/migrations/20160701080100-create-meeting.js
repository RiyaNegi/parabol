exports.up = async r => {
  try {
    await r.tableCreate('Meeting');
  } catch(e) {
    console.log(e);
  }
};

exports.down = async r => {
  try {
    return await r.tableDrop('Meeting');
  } catch(e) {
    console.log(e);
  }
};
