import { t } from "../i18n/i18n";
import { usePreferencesStore } from "../store/preferencesStore";

export const useTranslation = () => {
  usePreferencesStore((state) => state.language);
  return t;
};