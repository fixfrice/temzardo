import 'dayjs/locale/ru';

import dayjs from 'dayjs';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en.json';
import ru from '@/locales/ru.json';

const LANG_KEY = 'trainiq.lang';

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: localStorage.getItem(LANG_KEY) ?? (navigator.language.startsWith('ru') ? 'ru' : 'en'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

const apply = (lng: string) => {
  localStorage.setItem(LANG_KEY, lng);
  dayjs.locale(lng);
  document.documentElement.lang = lng;
};
apply(i18n.language);
i18n.on('languageChanged', apply);

export default i18n;
