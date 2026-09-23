import en from './en';
import hi from './hi';
import ta from './ta';

const DICTS = { en, hi, ta };

export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English', speech: 'en-IN' },
  { code: 'hi', label: 'हिं', name: 'हिन्दी', speech: 'hi-IN' },
  { code: 'ta', label: 'த', name: 'தமிழ்', speech: 'ta-IN' },
];

export function translate(language, key, params = {}) {
  const template = DICTS[language]?.[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
}

export function speechCode(language) {
  return LANGUAGES.find((l) => l.code === language)?.speech || 'en-IN';
}
