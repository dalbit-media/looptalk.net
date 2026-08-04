ALTER TABLE `ConversationParticipant`
ADD COLUMN `role` VARCHAR(191) NOT NULL DEFAULT 'MEMBER';

UPDATE `ConversationParticipant`
SET `role` = 'OWNER'
WHERE `id` IN (
  SELECT `id` FROM (
    SELECT
      cp.`id`,
      ROW_NUMBER() OVER (
        PARTITION BY cp.`conversationId`
        ORDER BY cp.`joinedAt` ASC, cp.`id` ASC
      ) AS owner_rank
    FROM `ConversationParticipant` cp
    INNER JOIN `Conversation` c ON c.`id` = cp.`conversationId`
    WHERE c.`isGroupChat` = TRUE
  ) ranked
  WHERE ranked.owner_rank = 1
);
