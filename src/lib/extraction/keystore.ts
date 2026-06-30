/**
 * Bring-your-own-key storage for the Anthropic API key.
 *
 * MVP is frontend-only, so there is no server to hold the key — the user pastes
 * their own key and it lives in localStorage on their machine. This is a
 * deliberate prototype tradeoff (the key is exposed to client code); the Phase-2
 * backend proxy is the proper fix. Never commit a key or ship a default one.
 */
const STORAGE_KEY = 'storyatlas.anthropicApiKey';

export function getApiKey(): string {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function setApiKey(key: string): void {
	if (typeof localStorage === 'undefined') return;
	const trimmed = key.trim();
	if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
	else localStorage.removeItem(STORAGE_KEY);
}

export function clearApiKey(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(STORAGE_KEY);
}

export function hasApiKey(): boolean {
	return getApiKey().length > 0;
}
