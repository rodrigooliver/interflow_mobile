import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LOCALES,
  translations,
  type AppLocale,
  type TranslationDict,
} from '../i18n/translations';
import {saveLocalePreference} from '../services/appPreferences';

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: TranslationDict;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function I18nProvider({
  children,
  initialLocale = 'pt',
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    void saveLocalePreference(next).catch(e =>
      console.warn('[I18n] failed to persist', e),
    );
  }, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: translations[locale],
      locales: LOCALES,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
