import { getRandomBytes } from "expo-crypto";
import { generateAccountIdentity, encryptOwnerValue, decryptOwnerValue, identityFromRecoveryKey } from "./accountEncryption";
import { encodeBase64 } from "tweetnacl-util";

export { identityFromRecoveryKey, signAccountChallenge } from "./accountEncryption";
export { normalizeIdentifier, isUsername, createCredentialIdentity, CREDENTIAL_ITERATIONS } from "./credentialEncryption";
export const createAccountIdentity = async () => generateAccountIdentity(getRandomBytes);
export const createCredentialSalt = () => encodeBase64(getRandomBytes(16));

// Credentials unlock a separate account key, so they can change without re-encrypting the vault.
export const wrapAccountKey = (credentialIdentity, accountIdentity) =>
  encryptOwnerValue(credentialIdentity, "account-key", accountIdentity.recoveryKey, getRandomBytes);
export const unwrapAccountKey = (credentialIdentity, wrapped) =>
  identityFromRecoveryKey(decryptOwnerValue(credentialIdentity, "account-key", wrapped));

// 32 unambiguous symbols divide 256 evenly, so every character is uniformly random (80 bits total).
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz123456789";
export const generatePassword = () => Array.from(getRandomBytes(16), (byte) => PASSWORD_ALPHABET[byte % 32])
  .join("").match(/.{4}/g).join("-");

const ADJECTIVES = ["brave", "calm", "clever", "cosmic", "eager", "gentle", "golden", "happy", "jolly", "kind", "lucky", "mellow", "noble", "quiet", "rapid", "sunny", "swift", "witty"];
const NOUNS = ["otter", "falcon", "maple", "comet", "harbor", "lantern", "meadow", "panda", "river", "sparrow", "tiger", "willow", "breeze", "cedar", "dolphin", "ember", "fox", "garden"];
export const generateUsername = () => {
  const bytes = getRandomBytes(4);
  const number = 100 + (((bytes[2] << 8) | bytes[3]) % 9900);
  return `${ADJECTIVES[bytes[0] % ADJECTIVES.length]}-${NOUNS[bytes[1] % NOUNS.length]}-${number}`;
};
