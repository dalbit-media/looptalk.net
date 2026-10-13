const APP_TEXT_SCALES = { standard: 1, large: 1.12, extraLarge: 1.25 };

export const getAppTextScale = (size) => APP_TEXT_SCALES[size] || 1;

export const getChatMessageFontSize = (size) => 18 * getAppTextScale(size);
