import { messages, type Locale, type MessageKey } from './messages';

/**
 * Reactive i18n singleton. `locale` is Svelte 5 `$state`, so any component that
 * calls `t(...)` during render re-renders when the language changes. The choice
 * is persisted to localStorage. German is the default.
 */

const STORAGE_KEY = 'storyatlas:locale';
const DEFAULT_LOCALE: Locale = 'de';

function initialLocale(): Locale {
	if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
	const saved = localStorage.getItem(STORAGE_KEY);
	return saved === 'de' || saved === 'en' ? saved : DEFAULT_LOCALE;
}

class I18n {
	locale = $state<Locale>(initialLocale());

	setLocale(locale: Locale): void {
		this.locale = locale;
		if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
	}

	/** Translate a key for the current locale, interpolating {placeholder} params. */
	t = (key: MessageKey, params?: Record<string, string | number>): string => {
		let str: string = messages[this.locale][key] ?? messages.en[key] ?? key;
		if (params) {
			for (const [k, v] of Object.entries(params)) str = str.replaceAll(`{${k}}`, String(v));
		}
		return str;
	};
}

export const i18n = new I18n();
/** Bound translate function for ergonomic use in templates: {t('nav.editor')}. */
export const t = i18n.t;
