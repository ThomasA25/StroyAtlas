import { describe, it, expect } from 'vitest';
import { emptyProject } from './model';
import { asCharacterId, asEventId, asSceneId } from './ids';
import { characterRelationships } from './relationships';

const a = asCharacterId('a');
const b = asCharacterId('b');
const c = asCharacterId('c');

describe('characterRelationships', () => {
	it('weights links by co-occurrence across events and scenes', () => {
		const p = emptyProject();
		for (const id of [a, b, c]) {
			p.characters[id] = { id, name: id, faction: null, aliases: [], origin: 'manual' };
		}
		const e = asEventId('e');
		p.events[e] = {
			id: e,
			title: 'meet',
			locationId: null,
			charactersInvolved: [a, b],
			summary: '',
			orderIndex: 0,
			origin: 'manual'
		};
		const s = asSceneId('s');
		p.scenes[s] = {
			id: s,
			orderIndex: 0,
			startHint: '',
			endHint: '',
			locationId: null,
			characters: [a, b, c],
			eventIds: [],
			transitionToNext: '',
			origin: 'manual'
		};

		const links = characterRelationships(p);
		const ab = links.find((l) => l.a === a && l.b === b);
		const ac = links.find((l) => l.a === a && l.b === c);
		expect(ab?.weight).toBe(2); // event + scene
		expect(ac?.weight).toBe(1); // scene only
		expect(links[0]?.weight).toBe(2); // sorted strongest-first
	});
});
