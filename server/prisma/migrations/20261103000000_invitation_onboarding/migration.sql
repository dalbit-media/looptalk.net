ALTER TABLE "PrivateInvitation" ADD COLUMN "inviteeDisplayName" TEXT;
ALTER TABLE "PrivateInvitation" ADD COLUMN "message" TEXT;
ALTER TABLE "User" ADD COLUMN "credentialPublicKey" TEXT;
ALTER TABLE "User" ADD COLUMN "credentialAccountId" TEXT;
ALTER TABLE "User" ADD COLUMN "wrappedAccountKey" TEXT;
CREATE UNIQUE INDEX "User_credentialPublicKey_key" ON "User"("credentialPublicKey");
CREATE UNIQUE INDEX "User_credentialAccountId_key" ON "User"("credentialAccountId");