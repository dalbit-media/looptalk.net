export const attachMediaPlayback = (element, stream, onBlocked) => {
  let disposed = false;
  let pending = false;
  let listening = false;
  const document = globalThis.document;
  element.srcObject = stream || null;
  if (!stream) onBlocked?.(false);

  const stopListening = () => {
    document?.removeEventListener("pointerdown", play, true);
    document?.removeEventListener("keydown", play, true);
    listening = false;
  };
  const failed = (error) => {
    if (disposed) return;
    console.warn("Call media playback needs attention:", error);
    onBlocked?.(true);
    if (!listening) {
      document?.addEventListener("pointerdown", play, true);
      document?.addEventListener("keydown", play, true);
      listening = true;
    }
  };
  const play = () => {
    if (disposed || pending || !stream) return;
    pending = true;
    let result;
    try {
      result = element.play();
    } catch (error) {
      pending = false;
      failed(error);
      return;
    }
    Promise.resolve(result).then(() => {
      if (disposed) return;
      stopListening();
      onBlocked?.(false);
    }, failed).finally(() => { pending = false; });
  };
  play();
  return () => {
    disposed = true;
    stopListening();
    if (element.srcObject === stream) element.srcObject = null;
  };
};
