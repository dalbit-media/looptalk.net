CREATE TABLE "ForumPoll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumPoll_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ForumOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pollId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "ForumOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ForumPoll" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ForumVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ForumPoll" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumVote_optionId_pollId_fkey" FOREIGN KEY ("optionId", "pollId") REFERENCES "ForumOption" ("id", "pollId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ForumComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pollId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumComment_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ForumPoll" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ForumPoll_createdAt_id_idx" ON "ForumPoll"("createdAt", "id");
CREATE UNIQUE INDEX "ForumOption_id_pollId_key" ON "ForumOption"("id", "pollId");
CREATE UNIQUE INDEX "ForumOption_pollId_position_key" ON "ForumOption"("pollId", "position");
CREATE UNIQUE INDEX "ForumVote_pollId_userId_key" ON "ForumVote"("pollId", "userId");
CREATE INDEX "ForumVote_userId_idx" ON "ForumVote"("userId");
CREATE INDEX "ForumVote_optionId_pollId_idx" ON "ForumVote"("optionId", "pollId");
CREATE INDEX "ForumComment_pollId_createdAt_id_idx" ON "ForumComment"("pollId", "createdAt", "id");
CREATE INDEX "ForumComment_authorId_idx" ON "ForumComment"("authorId");
