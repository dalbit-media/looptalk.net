CREATE TABLE "SecureDevice" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecureDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SecureDevice_userId_idx" ON "SecureDevice"("userId");

CREATE TABLE "SecureDispatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "digest" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderDeviceId" TEXT NOT NULL,
    "senderPublicKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecureDispatch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SecureDispatch_conversationId_messageId_kind_idx" ON "SecureDispatch"("conversationId", "messageId", "kind");

CREATE TABLE "SecurePayload" (
    "dispatchId" TEXT NOT NULL PRIMARY KEY,
    "ciphertext" BLOB NOT NULL,
    CONSTRAINT "SecurePayload_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "SecureDispatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SecureEnvelope" (
    "dispatchId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    PRIMARY KEY ("dispatchId", "deviceId"),
    CONSTRAINT "SecureEnvelope_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "SecureDispatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SecureEnvelope_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SecureDevice" ("deviceId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SecureEnvelope_deviceId_idx" ON "SecureEnvelope"("deviceId");
