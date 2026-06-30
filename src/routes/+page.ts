import { redirect } from '@sveltejs/kit';
import { EDIT_MODE } from '$lib/core/env';

// The editor is a local-only authoring tool. In the published (read-only) build
// a direct visit to "/" lands on the map viewer instead of the data editor.
export const load = () => {
	if (!EDIT_MODE) redirect(307, '/map');
};
