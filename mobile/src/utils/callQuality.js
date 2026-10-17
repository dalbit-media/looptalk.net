export const videoEncodingProfile = (screenSharing) => ({
  maxBitrate: screenSharing ? 4000000 : 2000000,
  maxFramerate: screenSharing ? 15 : 30,
  scaleResolutionDownBy: 1,
  degradationPreference: screenSharing ? "maintain-resolution" : "balanced",
});

export const summarizeCallStats = (stats, previousAudio = new Map()) => {
  const audio = new Map();
  let selectedPair;
  let fallbackPair;
  let received = 0;
  let lost = 0;
  let jitter = 0;
  let concealed = 0;
  let samples = 0;
  stats.forEach((report) => {
    if (report.type === "transport" && report.selectedCandidatePairId) {
      selectedPair = stats.get(report.selectedCandidatePairId) || selectedPair;
    }
    if (report.type === "candidate-pair" && report.state === "succeeded" && (report.selected || report.nominated)) {
      fallbackPair = report;
    }
    if (report.type !== "inbound-rtp" || (report.kind || report.mediaType) !== "audio") return;
    const current = {
      packetsReceived: report.packetsReceived || 0,
      packetsLost: report.packetsLost || 0,
      concealedSamples: report.concealedSamples || 0,
      totalSamplesReceived: report.totalSamplesReceived || 0,
    };
    const previous = previousAudio.get(report.id);
    if (previous && current.packetsReceived >= previous.packetsReceived) {
      received += current.packetsReceived - previous.packetsReceived;
      lost += Math.max(0, current.packetsLost - previous.packetsLost);
      concealed += Math.max(0, current.concealedSamples - previous.concealedSamples);
      samples += Math.max(0, current.totalSamplesReceived - previous.totalSamplesReceived);
    }
    audio.set(report.id, current);
    jitter = Math.max(jitter, report.jitter || 0);
  });
  const pair = selectedPair || fallbackPair;
  const roundTripTime = pair?.currentRoundTripTime || 0;
  const lossRate = received + lost > 0 ? lost / (received + lost) : 0;
  const concealmentRate = samples > 0 ? concealed / samples : 0;
  const quality = lossRate > 0.08 || concealmentRate > 0.08 || roundTripTime > 0.5 || jitter > 0.05
    ? "poor"
    : lossRate > 0.03 || concealmentRate > 0.03 || roundTripTime > 0.25 || jitter > 0.03
      ? "fair"
      : "good";
  return { audio, quality };
};
