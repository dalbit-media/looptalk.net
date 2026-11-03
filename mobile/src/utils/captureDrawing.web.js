import { paintingExportSize } from "./painting";

export const captureDrawing = async (canvasRef, paths) => {
  const view = canvasRef.current;
  const { width, height } = view.getBoundingClientRect();
  if (width <= 0 || height <= 0) throw new Error("The drawing canvas is not visible");
  const canvas = view.ownerDocument.createElement("canvas");
  const output = paintingExportSize(width, height, Math.max(2, view.ownerDocument.defaultView?.devicePixelRatio || 1));
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the drawing image");
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(canvas.width / width, canvas.height / height);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const path of paths) {
    context.globalAlpha = path.opacity ?? 1;
    if (path.strokeWidth) {
      context.strokeStyle = path.color;
      context.lineWidth = path.strokeWidth;
      context.stroke(new Path2D(path.d));
    } else {
      context.fillStyle = path.color;
      context.fill(new Path2D(path.d));
    }
  }
  return canvas.toDataURL("image/png");
};

export const releaseDrawing = () => {};
