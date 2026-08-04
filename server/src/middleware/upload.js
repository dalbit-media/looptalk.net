const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { uploadDirectory } = require("../utils/uploadStorage");


// Maps each accepted mimetype to a safe, fixed extension. The extension is
// always derived from this allowlist rather than the client-supplied
// filename, preventing extension spoofing (e.g. uploading an ".html" file
// disguised as an image, which could otherwise be served back with a
// text/html content-type and enable stored XSS).
const MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/webm": ".webm",
  "audio/m4a": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".weba",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/zip": ".zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    const ext = MIME_EXTENSIONS[file.mimetype] || "";
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (MIME_EXTENSIONS[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

module.exports = upload;
module.exports.storage = storage;
