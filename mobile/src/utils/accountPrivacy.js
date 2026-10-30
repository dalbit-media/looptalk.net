import { getRandomBytes } from "expo-crypto";
import { generateAccountIdentity } from "./accountEncryption";
import { encodeBase64 } from "tweetnacl-util";

export { identityFromRecoveryKey, signAccountChallenge } from "./accountEncryption";
export { normalizeIdentifier, isUsername, createCredentialIdentity, CREDENTIAL_ITERATIONS } from "./credentialEncryption";
export const createAccountIdentity = async () => generateAccountIdentity(getRandomBytes);
export const createCredentialSalt = () => encodeBase64(getRandomBytes(16));

const ADJECTIVES = ["brave", "calm", "clever", "cosmic", "eager", "gentle", "golden", "happy", "jolly", "kind", "lucky", "mellow", "noble", "quiet", "rapid", "sunny", "swift", "witty"];
const NOUNS = ["otter", "falcon", "maple", "comet", "harbor", "lantern", "meadow", "panda", "river", "sparrow", "tiger", "willow", "breeze", "cedar", "dolphin", "ember", "fox", "garden"];
export const generateUsername = () => {
  const bytes = getRandomBytes(4);
  const number = 100 + (((bytes[2] << 8) | bytes[3]) % 9900);
  return `${ADJECTIVES[bytes[0] % ADJECTIVES.length]}-${NOUNS[bytes[1] % NOUNS.length]}-${number}`;
};
