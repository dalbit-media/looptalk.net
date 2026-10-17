ALTER TABLE "PrivateInvitation" ADD COLUMN "inviterId" TEXT;
ALTER TABLE "PrivateInvitation" ADD COLUMN "acceptedById" TEXT;
ALTER TABLE "PrivateInvitation" ADD COLUMN "acceptedAt" DATETIME;
CREATE UNIQUE INDEX "PrivateInvitation_acceptedById_key" ON "PrivateInvitation"("acceptedById");
