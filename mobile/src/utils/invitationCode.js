export const normalizeInvitationCode = (value) => typeof value === "string"
  ? value.replace(/[\s-]/g, "").toUpperCase() : "";
export const validInvitationCode = (value) => /^(?:[A-Z0-9]{8}|[2-9A-HJ-NP-Z]{10}|[A-F0-9]{32})$/.test(value);
