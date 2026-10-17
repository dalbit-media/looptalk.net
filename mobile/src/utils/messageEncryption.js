import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util";

export { encodeBase64, decodeBase64 };

export const deviceFingerprint = (publicKey) => Array.from(
  nacl.hash(decodeBase64(publicKey)).subarray(0, 32),
  (byte) => byte.toString(16).padStart(2, "0")
).join("").match(/.{1,4}/g).join(" ");

export const createDeviceIdentity = (randomBytes, deviceId) => {
  const keys = nacl.box.keyPair.fromSecretKey(randomBytes(nacl.box.secretKeyLength));
  return {
    deviceId,
    publicKey: encodeBase64(keys.publicKey),
    secretKey: encodeBase64(keys.secretKey),
  };
};

export const encryptDelivery = (payload, identity, devices, randomBytes) => {
  const key = randomBytes(nacl.secretbox.keyLength);
  const nonce = randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(decodeUTF8(JSON.stringify(payload)), nonce, key);
  const bytes = new Uint8Array(nonce.length + ciphertext.length);
  bytes.set(nonce);
  bytes.set(ciphertext, nonce.length);
  const recipients = devices
    .filter((device) => device.deviceId !== identity.deviceId)
    .map((device) => {
      const envelopeNonce = randomBytes(nacl.box.nonceLength);
      return {
        deviceId: device.deviceId,
        publicKey: device.publicKey,
        nonce: encodeBase64(envelopeNonce),
        wrappedKey: encodeBase64(nacl.box(
          key, envelopeNonce, decodeBase64(device.publicKey), decodeBase64(identity.secretKey)
        )),
      };
    });
  key.fill(0);
  return { bytes, recipients };
};

export const decryptDelivery = (delivery, bytes, identity) => {
  const key = nacl.box.open(
    decodeBase64(delivery.wrappedKey),
    decodeBase64(delivery.nonce),
    decodeBase64(delivery.senderPublicKey),
    decodeBase64(identity.secretKey)
  );
  if (!key) throw new Error("Unable to authenticate encrypted message key");
  try {
    const plaintext = nacl.secretbox.open(
      bytes.subarray(nacl.secretbox.nonceLength),
      bytes.subarray(0, nacl.secretbox.nonceLength),
      key
    );
    if (!plaintext) throw new Error("Unable to authenticate encrypted message");
    const payload = JSON.parse(encodeUTF8(plaintext));
    if (
      payload.version !== 1 ||
      payload.id !== delivery.id ||
      payload.messageId !== delivery.messageId ||
      payload.conversationId !== delivery.conversationId ||
      payload.senderId !== delivery.senderId ||
      payload.senderDeviceId !== delivery.senderDeviceId ||
      payload.kind !== delivery.kind
    ) {
      throw new Error("Encrypted message routing does not match its authenticated payload");
    }
    return payload;
  } finally {
    key.fill(0);
  }
};
