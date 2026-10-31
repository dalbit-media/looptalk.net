CREATE TABLE "ForumReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumReaction_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ForumPoll" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ForumReaction_pollId_userId_emoji_key" ON "ForumReaction"("pollId", "userId", "emoji");
CREATE INDEX "ForumReaction_pollId_idx" ON "ForumReaction"("pollId");
CREATE INDEX "ForumReaction_userId_idx" ON "ForumReaction"("userId");
