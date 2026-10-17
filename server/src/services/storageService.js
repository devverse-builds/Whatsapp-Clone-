const path = require('path');
const fs = require('fs');
const os = require('os');

const isVercel = !!process.env.VERCEL;
const UPLOAD_DIR = isVercel
  ? path.join(os.tmpdir(), 'uploads')
  : path.resolve(__dirname, '../../../uploads');

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[StorageService] Could not create upload directory:', err.message);
}

let cloudinary = null;
if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const saveFile = async (file) => {
  // If Cloudinary is configured, upload to Cloudinary CDN
  if (cloudinary) {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: 'auto',
        folder: 'whatsapp_clone'
      });

      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }

      return {
        url: result.secure_url,
        publicId: result.public_id,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype
      };
    } catch (err) {
      console.warn('[StorageService] Cloudinary upload failed, falling back:', err.message);
    }
  }

  // On Vercel without Cloudinary: Convert to Base64 data URL to persist across serverless instances
  if (isVercel) {
    try {
      const fileBuffer = fs.readFileSync(file.path);
      const base64Data = fileBuffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${base64Data}`;

      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }

      return {
        url: dataUri,
        publicId: `data_${Date.now()}`,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype
      };
    } catch (readErr) {
      console.warn('[StorageService] DataURI conversion failed:', readErr.message);
    }
  }

  // Local storage: url served via /uploads/<filename>
  const fileName = path.basename(file.path);
  return {
    url: `/uploads/${fileName}`,
    publicId: fileName,
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype
  };
};

module.exports = {
  UPLOAD_DIR,
  saveFile
};
