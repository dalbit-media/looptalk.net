import { File } from "expo-file-system";
import { assertAttachmentSize } from "../config/limits";
import { encodedVideoName, encodingUnavailable } from "./attachmentSelection";

export const prepareAttachment = async (attachment, { original = false, onProgress } = {}) => {
  if (original || attachment.messageType !== "VIDEO") {
    assertAttachmentSize(attachment.fileSize || 0);
    return { payload: attachment, dispose() {} };
  }
  const { Video, getVideoMetaData } = require("react-native-compressor");
  const metadata = await getVideoMetaData(attachment.uri);
  const { width, height, size, duration } = metadata;
  if (!(width > 0 && height > 0 && size > 0 && duration > 0)) throw encodingUnavailable();
  const bitrate = Math.max(2_000_000, Math.round(width * height * 30 * 0.12));
  // Avoid re-encoding videos already below the high-quality target bitrate.
  if (size * 8 / duration <= bitrate) {
    assertAttachmentSize(size);
    return { payload: { ...attachment, fileSize: size }, dispose() {} };
  }
  const uri = await Video.compress(attachment.uri, {
    compressionMethod: "manual", maxSize: Math.max(width, height),
    bitrate, minimumFileSizeForCompress: 0, progressDivider: 5,
  }, onProgress);
  if (uri === attachment.uri) {
    assertAttachmentSize(size);
    return { payload: { ...attachment, fileSize: size }, dispose() {} };
  }
  const encoded = new File(uri);
  const dispose = () => { if (encoded.exists) encoded.delete(); };
  try {
    if (!(encoded.size > 0)) throw new Error("The video encoder produced an empty file");
    if (encoded.size >= size) {
      dispose();
      assertAttachmentSize(size);
      return { payload: { ...attachment, fileSize: size }, dispose() {} };
    }
    assertAttachmentSize(encoded.size);
    return {
      payload: {
        ...attachment, uri, mimeType: "video/mp4",
        name: encodedVideoName(attachment.name, "mp4"),
        fileName: encodedVideoName(attachment.name, "mp4"), fileSize: encoded.size,
        width, height, duration: Math.round(duration * 1000),
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
};
