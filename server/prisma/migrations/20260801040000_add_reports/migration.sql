CREATE TABLE `Report` (
  `id` VARCHAR(191) NOT NULL,
  `reporterId` VARCHAR(191) NULL,
  `reportedUserId` VARCHAR(191) NULL,
  `messageId` VARCHAR(191) NULL,
  `category` VARCHAR(191) NOT NULL,
  `details` TEXT NULL,
  `contentSnapshot` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedAt` DATETIME(3) NULL,

  INDEX `Report_reporterId_createdAt_idx`(`reporterId`, `createdAt`),
  INDEX `Report_reportedUserId_status_idx`(`reportedUserId`, `status`),
  INDEX `Report_messageId_idx`(`messageId`),
  INDEX `Report_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Report` ADD CONSTRAINT `Report_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Report` ADD CONSTRAINT `Report_reportedUserId_fkey` FOREIGN KEY (`reportedUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Report` ADD CONSTRAINT `Report_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
