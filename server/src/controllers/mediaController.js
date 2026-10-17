const { saveFile } = require('../services/storageService');

const uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided for upload'
      });
    }

    const saved = await saveFile(req.file);

    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: saved
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadMedia
};
