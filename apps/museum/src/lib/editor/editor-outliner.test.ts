import { describe, expect, it } from 'vitest';
import { formatPlacementLabel } from './editor-outliner';

describe('formatPlacementLabel', () => {
	it('turns hyphenated placement ids into readable title case', () => {
		expect(formatPlacementLabel('main-piano')).toBe('Main Piano');
		expect(formatPlacementLabel('piano-rug')).toBe('Piano Rug');
	});

	it('keeps repeated asset placements distinguishable', () => {
		expect(formatPlacementLabel('sofa-chair-right')).toBe('Sofa Chair Right');
		expect(formatPlacementLabel('front-chair-right')).toBe('Front Chair Right');
	});

	it('normalizes underscores, repeated separators, and surrounding whitespace', () => {
		expect(formatPlacementLabel('  publisher__table-lamp  ')).toBe(
			'Publisher Table Lamp'
		);
	});
});
