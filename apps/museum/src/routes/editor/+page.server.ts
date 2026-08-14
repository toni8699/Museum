import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';

export function load() {
	const demoEditor = import.meta.env.VITE_MUSEUM_EDITOR === '1';
	if (!dev && !demoEditor) error(404, 'Not found');
	return {};
}
