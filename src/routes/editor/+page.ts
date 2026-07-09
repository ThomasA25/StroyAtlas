import { redirect } from '@sveltejs/kit';
import { EDIT_MODE } from '$lib/core/env';

// The map editor is a local-only authoring tool, like the story editor at "/".
// A direct visit in the published (read-only) build lands on the map viewer.
export const load = () => {
	if (!EDIT_MODE) redirect(307, '/map');
};
