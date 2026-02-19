
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Garantir que a pasta temporária exista
const tmpDir = path.join(__dirname, "../uploads/tmp");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tmpDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

function fileFilter(req, file, cb) {
  const allowedVideo = ["video/mp4", "video/quicktime", "video/x-matroska"];
  const allowedImage = ["image/jpeg", "image/png", "image/webp"];

  if (
    allowedVideo.includes(file.mimetype) ||
    allowedImage.includes(file.mimetype)
  ) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only MP4, MOV, MKV and images are allowed."));
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: 800 * 1024 * 1024 // 800MB
  },
  fileFilter
});

module.exports = upload;
