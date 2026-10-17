import { getRandomBytes } from "expo-crypto";
import { generateAccountIdentity } from "./accountEncryption";
import { encodeBase64 } from "tweetnacl-util";

export { identityFromRecoveryKey, signAccountChallenge } from "./accountEncryption";
export { normalizeIdentifier, createCredentialIdentity, CREDENTIAL_ITERATIONS } from "./credentialEncryption";
export const createAccountIdentity = async () => generateAccountIdentity(getRandomBytes);
export const createCredentialSalt = () => encodeBase64(getRandomBytes(16));
