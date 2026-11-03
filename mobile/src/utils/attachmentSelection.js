export const LIBRARY_PICKER_OPTIONS = {
  mediaTypes: ["images", "videos"],
  allowsMultipleSelection: true,
  orderedSelection: true,
  quality: 1,
  videoExportPreset: 0,
  preferredAssetRepresentationMode: "current",
};

export const FILE_PICKER_OPTIONS = {
  type: "*/*",
  copyToCacheDirectory: true,
  multiple: true,
};

const types = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime",
  webm: "video/webm", m4v: "video/mp4", m4a: "audio/mp4", wav: "audio/wav",
};

export const selectedAttachment = (asset) => {
  const name = asset.fileName || asset.name || asset.file?.name ||
    (asset.type === "video" ? "video.mp4" : asset.type === "image" ? "photo.jpg" : "file");
  const extension = name.split(".").pop().toLowerCase();
  const mimeType = asset.mimeType && asset.mimeType !== "application/octet-stream"
    ? asset.mimeType : types[extension] || "application/octet-stream";
  return {
    uri: asset.uri, name, fileName: name, mimeType,
    fileSize: asset.fileSize ?? asset.size ?? asset.file?.size,
    messageType: mimeType.startsWith("video/") || asset.type === "video" ? "VIDEO"
      : mimeType.startsWith("image/") || asset.type === "image" ? "IMAGE" : "FILE",
    width: asset.width, height: asset.height,
    duration: asset.duration != null ? Math.round(asset.duration) : null,
  };
};

export const encodedVideoName = (name, extension) =>
  `${name.replace(/\.[^.]+$/, "")}.${extension}`;

export const encodingUnavailable = () =>
  Object.assign(new Error("Video encoding is unavailable. Select Original size to send without encoding."), {
    code: "VIDEO_ENCODING_UNAVAILABLE",
  });

export const releaseSelectedAttachment = (attachment) => {
  if (attachment.uri.startsWith("blob:") && typeof URL !== "undefined" &&
      typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(attachment.uri);
  }
};
