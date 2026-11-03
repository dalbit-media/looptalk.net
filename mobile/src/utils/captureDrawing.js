import { captureRef, releaseCapture } from "react-native-view-shot";

export const captureDrawing = (canvasRef) => captureRef(canvasRef, {
  format: "png", quality: 1, result: "tmpfile",
});

export const releaseDrawing = (uri) => releaseCapture(uri);
