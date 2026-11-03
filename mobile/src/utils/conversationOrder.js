export const compareConversations = (left, right) =>
  Number(right.kind === "NOTES") - Number(left.kind === "NOTES") ||
  new Date(right.messages?.[0]?.createdAt || right.lastMessageAt || right.createdAt) -
    new Date(left.messages?.[0]?.createdAt || left.lastMessageAt || left.createdAt);
