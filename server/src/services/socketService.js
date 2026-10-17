let io = null;

const initIO = (socketIOInstance) => {
  io = socketIOInstance;
  return io;
};

const getIO = () => {
  return io;
};

module.exports = {
  initIO,
  getIO
};
