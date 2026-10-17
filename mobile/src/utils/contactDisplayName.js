export const contactDisplayNames = (contacts) => new Map(
  Object.values(contacts).flat().map((contact) => [
    contact.contactUserId,
    contact,
  ])
);

export const resolveContactDisplayName = (contact, user) => {
  const publicName = user?.displayName && user.displayName !== user.username && user.displayName !== user.id
    ? user.displayName : null;
  return contact?.nickname || publicName || contact?.contactUser?.displayName || user?.displayName || user?.username;
};

export const resolveDisplayName = (names, user, userId = user?.id) =>
  resolveContactDisplayName(names.get(userId), user);
