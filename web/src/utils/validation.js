export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 128;

export const isValidEmail = (value) => {
  const email = value.trim();
  return email.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const normalizePhoneNumber = (value) => {
  const phoneNumber = value.trim().replace(/[\s().-]/g, "");
  return phoneNumber.startsWith("+")
    ? `+${phoneNumber.slice(1).replace(/\D/g, "")}`
    : phoneNumber.replace(/\D/g, "");
};

export const isValidPhoneNumber = (value) => /^\+?\d{7,15}$/.test(
  normalizePhoneNumber(value)
);