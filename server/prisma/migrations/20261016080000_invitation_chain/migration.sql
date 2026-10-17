ALTER TABLE "Invitation" ADD COLUMN "acceptedById" TEXT
    REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Invitation_acceptedById_key" ON "Invitation"("acceptedById");
