ALTER TABLE "User" ADD COLUMN "authAccountId" TEXT;
ALTER TABLE "User" ADD COLUMN "credentialSalt" TEXT;
ALTER TABLE "User" ADD COLUMN "contactLookup" TEXT;
ALTER TABLE "User" ADD COLUMN "encryptedIdentifier" TEXT;
ALTER TABLE "User" ADD COLUMN "publicUsername" TEXT;
CREATE UNIQUE INDEX "User_authAccountId_key" ON "User"("authAccountId");
CREATE UNIQUE INDEX "User_contactLookup_key" ON "User"("contactLookup");
CREATE UNIQUE INDEX "User_publicUsername_key" ON "User"("publicUsername");
