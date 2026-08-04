// Web stub: no native audio-routing/proximity-sensor APIs exist in the
// browser. Browser voice calls use the selected system audio devices, so
// these no-ops keep the shared call store platform-safe.
const noop = () => {};

export default {
  start: noop,
  stop: noop,
  setForceSpeakerphoneOn: noop,
  setKeepScreenOn: noop,
  setMicrophoneMute: noop,
  startRingtone: noop,
  stopRingtone: noop,
};
