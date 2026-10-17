const WELCOME_MESSAGE = [
  "Welcome to LoopTalk!",
  "LoopTalk is an invitation-only messenger for your trusted circle. Invite people, organize contacts, chat one-to-one or in groups, share photos, videos, files and voice messages, and make audio or video calls across mobile and web.",
  "Have a question or feedback? Reply here to message the person who invited you.",
].join("\n\n");

const LOOPTALK_USER_ID = "looptalk-system";
const INVITATION_WELCOME_MESSAGE =
  "루프톡에 오신 것을 환영해요! 아래 입력창에서 답장해 보세요. + 버튼으로 사진·파일을 보내고, 통화 버튼으로 음성·영상 통화를 시작할 수 있어요.";

const createInvitationWelcome = async (tx, inviterId, inviteeId) => {
  const inviter = await tx.user.findUnique({ where: { id: inviterId }, select: { id: true, status: true } });
  if (!inviter || inviter.status === "SYSTEM" || inviterId === inviteeId) return null;
  const createdAt = new Date();
  return tx.conversation.create({
    data: {
      kind: "CHAT", isGroupChat: false, lastMessageAt: createdAt,
      participants: { create: [{ userId: inviterId }, { userId: inviteeId }] },
      messages: { create: {
        senderId: inviterId, messageType: "TEXT", content: INVITATION_WELCOME_MESSAGE,
        automaticWelcome: true, createdAt,
      } },
    },
    include: {
      participants: { include: { user: { select: { id: true, publicUsername: true, publicDisplayName: true, username: true } } } },
      messages: { include: { sender: { select: { id: true, publicUsername: true, publicDisplayName: true, username: true } } } },
    },
  });
};

const ensureWelcomeSender = (tx) => tx.user.upsert({
  where: { id: LOOPTALK_USER_ID },
  update: {},
  create: {
    id: LOOPTALK_USER_ID,
    username: "looptalk.system",
    displayName: "LoopTalk",
    status: "SYSTEM",
  },
});

const upgradeWelcomeConversations = (prisma) => prisma.$transaction(async (tx) => {
  const where = { conversation: { kind: "WELCOME" }, messageType: "SYSTEM" };
  if (await tx.message.count({ where }) === 0) return;
  const sender = await ensureWelcomeSender(tx);
  await tx.message.updateMany({
    where,
    data: { senderId: sender.id, messageType: "TEXT" },
  });
  await tx.conversation.updateMany({
    where: { kind: "WELCOME", name: "LoopTalk Welcome" },
    data: { name: "LoopTalk" },
  });
});

const createWelcomeConversation = async (tx, userId) => {
  const sender = await ensureWelcomeSender(tx);
  const createdAt = new Date();
  return tx.conversation.create({
    data: {
      name: "LoopTalk",
      kind: "WELCOME",
      lastMessageAt: createdAt,
      participants: { create: { userId, joinedAt: createdAt } },
      messages: {
        create: {
          senderId: sender.id,
          messageType: "TEXT",
          content: WELCOME_MESSAGE,
          createdAt,
        },
      },
    },
  });
};

module.exports = {
  INVITATION_WELCOME_MESSAGE,
  createInvitationWelcome,
  ensureWelcomeSender,
  createWelcomeConversation,
  upgradeWelcomeConversations,
  LOOPTALK_USER_ID,
  WELCOME_MESSAGE,
};
