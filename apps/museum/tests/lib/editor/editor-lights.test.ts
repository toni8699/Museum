import { describe, expect, it } from 'vitest';
import {
	applyLightFieldPatch,
	createLightEntity,
	DEFAULT_LIGHT_COLOR,
	DEFAULT_LIGHT_HEIGHT,
	DEFAULT_LIGHT_INTENSITY,
	DEFAULT_LIGHT_RANGE,
	DEFAULT_SPOT_ANGLE,
	DEFAULT_SPOT_PENUMBRA,
	LIGHT_LIBRARY,
	validateLightAngle,
	validateLightColor,
	validateLightIntensity,
	validateLightPenumbra,
	validateLightRange
} from '$lib/editor/editor-lights';

describe('editor-lights', () => {
	it('lists the three built-in light kinds', () => {
		expect(LIGHT_LIBRARY.map((item) => item.kind)).toEqual(['point', 'spot', 'directional']);
	});

	it('builds conservative default entities', () => {
		const point = createLightEntity({
			id: 'light-1',
			kind: 'point',
			roomId: 'workshop',
			position: [1, DEFAULT_LIGHT_HEIGHT, 2]
		});
		expect(point).toMatchObject({
			kind: 'light',
			light: 'point',
			name: 'Point Light',
			roomId: 'workshop',
			position: [1, DEFAULT_LIGHT_HEIGHT, 2],
			rotation: [0, 0, 0],
			color: DEFAULT_LIGHT_COLOR,
			intensity: DEFAULT_LIGHT_INTENSITY,
			range: DEFAULT_LIGHT_RANGE,
			castShadow: false
		});

		const spot = createLightEntity({
			id: 'light-2',
			kind: 'spot',
			roomId: 'paris',
			position: [0, 2, 0]
		});
		expect(spot).toMatchObject({
			light: 'spot',
			angle: DEFAULT_SPOT_ANGLE,
			penumbra: DEFAULT_SPOT_PENUMBRA,
			range: DEFAULT_LIGHT_RANGE
		});

		const directional = createLightEntity({
			id: 'light-3',
			kind: 'directional',
			roomId: 'departure',
			position: [0, 3, 0]
		});
		expect(directional).toMatchObject({ light: 'directional' });
		expect(directional).not.toHaveProperty('range');
		expect(directional).not.toHaveProperty('angle');
	});

	it('rejects invalid color/intensity/range/angle/penumbra', () => {
		expect(validateLightColor('#fff')).toMatch(/#rrggbb/);
		expect(validateLightColor('#fff4e0')).toBeNull();
		expect(validateLightIntensity(-1)).toMatch(/≥ 0/);
		expect(validateLightIntensity(0)).toBeNull();
		expect(validateLightRange('point', 0)).toMatch(/greater than zero/);
		expect(validateLightRange('directional', 4)).toMatch(/do not use range/);
		expect(validateLightAngle('spot', 0)).toMatch(/\(0, π\]/);
		expect(validateLightAngle('spot', Math.PI)).toBeNull();
		expect(validateLightAngle('point', 1)).toMatch(/do not use angle/);
		expect(validateLightPenumbra('spot', 1.5)).toMatch(/\[0, 1\]/);
		expect(validateLightPenumbra('spot', 0.2)).toBeNull();
	});

	it('applies validated field patches in place', () => {
		const light = createLightEntity({
			id: 'light-4',
			kind: 'spot',
			roomId: 'workshop',
			position: [0, 2, 0]
		});
		expect(applyLightFieldPatch(light, { intensity: 2.5, angle: Math.PI / 4 })).toBeNull();
		expect(light).toMatchObject({ intensity: 2.5, angle: Math.PI / 4 });
		expect(applyLightFieldPatch(light, { range: -1 })).toMatch(/greater than zero/);
		expect(light).toMatchObject({ range: DEFAULT_LIGHT_RANGE });
	});

	it('rejects invalid optional overrides at create time', () => {
		expect(() =>
			createLightEntity({
				id: 'bad',
				kind: 'point',
				roomId: 'workshop',
				position: [0, 2, 0],
				range: 0
			})
		).toThrow(/greater than zero/);
	});
});
