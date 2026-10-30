ALTER TABLE "ForumPoll" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'contacts';

UPDATE "ForumPoll" SET "visibility" = 'public';
