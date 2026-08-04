const fs = require("fs");
const path = require("path");

const uploadDirectory = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads")
);

fs.mkdirSync(uploadDirectory, { recursive: true });

module.exports = { uploadDirectory };
