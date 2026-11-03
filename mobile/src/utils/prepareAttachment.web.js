import {
  Input, BlobSource, ALL_FORMATS, Output, BufferTarget, Mp4OutputFormat,
  Conversion, Quality, canEncodeVideo, canEncodeAudio,
} from "mediabunny";
import { assertAttachmentSize } from "../config/limits";
import { encodedVideoName, encodingUnavailable } from "./attachmentSelection";

export const prepareAttachment = async (attachment, { original = false, onProgress } = {}) => {
  if (original || attachment.messageType !== "VIDEO") {
    assertAttachmentSize(attachment.fileSize || 0);
    return { payload: attachment, dispose() {} };
  }
  const response = await fetch(attachment.uri);
  if (!response.ok) throw new Error(`Unable to read video (${response.status})`);
  const source = await response.blob();
  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
  let conversion;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw encodingUnavailable();
    const duration = Math.round(await input.computeDuration() * 1000);
    const metadata = { width: track.displayWidth, height: track.displayHeight, duration };
    const audio = await input.getAudioTracks();
    const quality = new Quality(0.8);
    const videoConfig = { width: track.displayWidth, height: track.displayHeight, quality };
    if (!await canEncodeVideo("avc", videoConfig) ||
        (audio.some((track) => track.codec !== "aac") && !await canEncodeAudio("aac"))) {
      throw encodingUnavailable();
    }
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    conversion = await Conversion.init({
      input, output,
      video: { codec: "avc", quality, hardwareAcceleration: "prefer-hardware" },
      // Copy compatible audio without another lossy encode.
      audio: { codec: "aac" },
    });
    if (!conversion.isValid || conversion.discardedTracks.length) throw encodingUnavailable();
    conversion.onProgress = (progress) => onProgress?.(progress);
    await conversion.execute();
    if (!target.buffer?.byteLength) throw new Error("The video encoder produced an empty file");
    const encoded = new Blob([target.buffer], { type: "video/mp4" });
    if (encoded.size >= source.size) {
      assertAttachmentSize(source.size);
      return { payload: { ...attachment, ...metadata, fileSize: source.size }, dispose() {} };
    }
    assertAttachmentSize(encoded.size);
    const uri = URL.createObjectURL(encoded);
    return {
      payload: {
        ...attachment, uri, mimeType: "video/mp4",
        name: encodedVideoName(attachment.name, "mp4"),
        fileName: encodedVideoName(attachment.name, "mp4"), fileSize: encoded.size,
        ...metadata,
      },
      dispose: () => URL.revokeObjectURL(uri),
    };
  } finally {
    if (conversion && conversion.state !== "done") await conversion.cancel();
    input.dispose();
  }
};
