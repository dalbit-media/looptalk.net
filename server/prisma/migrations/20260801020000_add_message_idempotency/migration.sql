ALTER TABLE `Message` ADD COLUMN `clientMessageId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Message_senderId_clientMessageId_key`
ON `Message`(`senderId`, `clientMessageId`);
