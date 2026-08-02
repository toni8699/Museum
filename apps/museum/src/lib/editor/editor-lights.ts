import type { SceneLightEntity, SceneLightKind } from '$lib/content/scene';
import type { MuseumRoomId, Vec3 } from '$lib/types/museum';

export type LightLibraryItem = {
	kind: SceneLightKind;
	name: string;
	description: string;
};

/** Built-in Lights catalogue for Add menu and Assets → Lights. */
export const LIGHT_LIBRARY: readonly LightLibraryItem[] = [
	{ kind: 'point', name: 'Point Light', description: 'Omnidirectional point light' },
	{ kind: 'spot', name: 'Spot Light', description: 'Cone spot light' },
	{ kind: 'directional', name: 'Directional Light', description: 'Parallel directional light' }
] as const;

export const DEFAULT_LIGHT_COLOR = '#fff4e0';
export const DEFAULT_LIGHT_INTENSITY = 1;
export const DEFAULT_LIGHT_RANGE = 8;
export const DEFAULT_SPOT_ANGLE = Math.PI / 6;
export const DEFAULT_SPOT_PENUMBRA = 0.15;
/** Room-local Y used when placing from a floor click. */
export const DEFAULT_LIGHT_HEIGHT = 2.5;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function lightDisplayName(kind: SceneLightKind): string {
	return LIGHT_LIBRARY.find((item) => item.kind === kind)?.name ?? kind;
}

export function isHexColor(value: string): boolean {
	return HEX_COLOR_PATTERN.test(value);
}

export function isNonNegativeFinite(value: number): boolean {
	return Number.isFinite(value) && value >= 0;
}

export function isPositiveFinite(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

export function createLightEntity(input: {
	id: string;
	kind: SceneLightKind;
	roomId: MuseumRoomId;
	position: Vec3;
	name?: string;
	color?: string;
	intensity?: number;
	range?: number;
	angle?: number;
	penumbra?: number;
	castShadow?: boolean;
	rotation?: Vec3;
	scale?: number;
}): SceneLightEntity {
	const color = input.color ?? DEFAULT_LIGHT_COLOR;
	const intensity = input.intensity ?? DEFAULT_LIGHT_INTENSITY;
	const colorError = validateLightColor(color);
	if (colorError) throw new Error(colorError);
	const intensityError = validateLightIntensity(intensity);
	if (intensityError) throw new Error(intensityError);

	const range =
		input.kind === 'directional'
			? undefined
			: (input.range ?? DEFAULT_LIGHT_RANGE);
	const rangeError = validateLightRange(input.kind, range);
	if (rangeError) throw new Error(rangeError);

	const angle = input.kind === 'spot' ? (input.angle ?? DEFAULT_SPOT_ANGLE) : undefined;
	const angleError = validateLightAngle(input.kind, angle);
	if (angleError) throw new Error(angleError);

	const penumbra =
		input.kind === 'spot' ? (input.penumbra ?? DEFAULT_SPOT_PENUMBRA) : undefined;
	const penumbraError = validateLightPenumbra(input.kind, penumbra);
	if (penumbraError) throw new Error(penumbraError);

	const base = {
		id: input.id,
		name: input.name ?? lightDisplayName(input.kind),
		roomId: input.roomId,
		position: [...input.position] as Vec3,
		rotation: [...(input.rotation ?? [0, 0, 0])] as Vec3,
		...(input.scale === undefined ? {} : { scale: input.scale }),
		kind: 'light' as const,
		color,
		intensity,
		castShadow: input.castShadow ?? false
	};

	switch (input.kind) {
		case 'point':
			return {
				...base,
				light: 'point',
				range: range!
			};
		case 'spot':
			return {
				...base,
				light: 'spot',
				angle: angle!,
				range: range!,
				...(penumbra === undefined ? {} : { penumbra })
			};
		case 'directional':
			return {
				...base,
				light: 'directional'
			};
	}
}

export function validateLightColor(color: string): string | null {
	if (!isHexColor(color)) return 'Color must be a #rrggbb hex string';
	return null;
}

export function validateLightIntensity(intensity: number): string | null {
	if (!isNonNegativeFinite(intensity)) return 'Intensity must be a finite number ≥ 0';
	return null;
}

export function validateLightRange(kind: SceneLightKind, range: number | undefined): string | null {
	if (kind === 'directional') {
		if (range !== undefined) return 'Directional lights do not use range';
		return null;
	}
	if (range === undefined) return null;
	if (!isPositiveFinite(range)) return 'Range must be a finite number greater than zero';
	return null;
}

export function validateLightAngle(kind: SceneLightKind, angle: number | undefined): string | null {
	if (kind !== 'spot') {
		if (angle !== undefined) return `${kind} lights do not use angle`;
		return null;
	}
	if (angle === undefined) return 'Spot lights require angle';
	if (!Number.isFinite(angle) || angle <= 0 || angle > Math.PI) {
		return 'Angle must be in (0, π] radians';
	}
	return null;
}

export function validateLightPenumbra(
	kind: SceneLightKind,
	penumbra: number | undefined
): string | null {
	if (kind !== 'spot') {
		if (penumbra !== undefined) return `${kind} lights do not use penumbra`;
		return null;
	}
	if (penumbra === undefined) return null;
	if (!Number.isFinite(penumbra) || penumbra < 0 || penumbra > 1) {
		return 'Penumbra must be in [0, 1]';
	}
	return null;
}

export type LightFieldPatch = {
	color?: string;
	intensity?: number;
	range?: number;
	angle?: number;
	penumbra?: number;
	castShadow?: boolean;
};

/** Validate then apply a field patch. No mutation on validation failure. */
export function applyLightFieldPatch(
	entity: SceneLightEntity,
	patch: LightFieldPatch
): string | null {
	if (patch.color !== undefined) {
		const error = validateLightColor(patch.color);
		if (error) return error;
	}
	if (patch.intensity !== undefined) {
		const error = validateLightIntensity(patch.intensity);
		if (error) return error;
	}
	if (patch.range !== undefined) {
		const error = validateLightRange(entity.light, patch.range);
		if (error) return error;
	}
	if (patch.angle !== undefined) {
		const error = validateLightAngle(entity.light, patch.angle);
		if (error) return error;
	}
	if (patch.penumbra !== undefined) {
		const error = validateLightPenumbra(entity.light, patch.penumbra);
		if (error) return error;
	}

	if (patch.color !== undefined) entity.color = patch.color;
	if (patch.intensity !== undefined) entity.intensity = patch.intensity;
	if (patch.castShadow !== undefined) entity.castShadow = patch.castShadow;
	if (patch.range !== undefined && (entity.light === 'point' || entity.light === 'spot')) {
		entity.range = patch.range;
	}
	if (patch.angle !== undefined && entity.light === 'spot') {
		entity.angle = patch.angle;
	}
	if (patch.penumbra !== undefined && entity.light === 'spot') {
		entity.penumbra = patch.penumbra;
	}
	return null;
}
