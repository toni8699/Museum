import type {
	SceneBoxDimensions,
	SceneCylinderDimensions,
	ScenePlaneDimensions,
	ScenePrimitiveDimensions,
	ScenePrimitiveEntity,
	ScenePrimitiveKind,
	SceneSphereDimensions
} from '$lib/content/scene';
import type { MaterialId } from '$lib/types/materials';
import type { MuseumRoomId, Vec3 } from '$lib/types/museum';

export type PrimitiveLibraryItem = {
	kind: ScenePrimitiveKind;
	name: string;
	description: string;
};

/** Built-in Shapes catalogue for Assets → Shapes and Add menu. */
export const PRIMITIVE_LIBRARY: readonly PrimitiveLibraryItem[] = [
	{ kind: 'box', name: 'Box', description: 'Parametric box' },
	{ kind: 'plane', name: 'Plane', description: 'Parametric plane' },
	{ kind: 'cylinder', name: 'Cylinder', description: 'Parametric cylinder' },
	{ kind: 'sphere', name: 'Sphere', description: 'Parametric sphere' }
] as const;

export const DEFAULT_PRIMITIVE_MATERIAL_ID: MaterialId = 'wood-walnut';

export function defaultPrimitiveDimensions(
	kind: ScenePrimitiveKind
): ScenePrimitiveDimensions {
	switch (kind) {
		case 'box':
			return { width: 1, height: 1, depth: 1 };
		case 'plane':
			return { width: 2, height: 2 };
		case 'cylinder':
			return { radius: 0.5, height: 1 };
		case 'sphere':
			return { radius: 0.5 };
	}
}

export function primitiveDisplayName(kind: ScenePrimitiveKind): string {
	return PRIMITIVE_LIBRARY.find((item) => item.kind === kind)?.name ?? kind;
}

export function createPrimitiveEntity(input: {
	id: string;
	kind: ScenePrimitiveKind;
	roomId: MuseumRoomId;
	position: Vec3;
	name?: string;
	materialId?: MaterialId;
	dimensions?: ScenePrimitiveDimensions;
	castShadow?: boolean;
	receiveShadow?: boolean;
	rotation?: Vec3;
	scale?: number;
}): ScenePrimitiveEntity {
	const dimensions = input.dimensions ?? defaultPrimitiveDimensions(input.kind);
	const base = {
		id: input.id,
		name: input.name ?? primitiveDisplayName(input.kind),
		roomId: input.roomId,
		position: [...input.position] as Vec3,
		rotation: [...(input.rotation ?? [0, 0, 0])] as Vec3,
		...(input.scale === undefined ? {} : { scale: input.scale }),
		kind: 'primitive' as const,
		materialId: input.materialId ?? DEFAULT_PRIMITIVE_MATERIAL_ID,
		castShadow: input.castShadow ?? true,
		receiveShadow: input.receiveShadow ?? true
	};

	switch (input.kind) {
		case 'box':
			return {
				...base,
				primitive: 'box',
				dimensions: dimensions as Extract<
					ScenePrimitiveDimensions,
					{ width: number; height: number; depth: number }
				>
			};
		case 'plane':
			return {
				...base,
				primitive: 'plane',
				dimensions: dimensions as Extract<
					ScenePrimitiveDimensions,
					{ width: number; height: number }
				>
			};
		case 'cylinder':
			return {
				...base,
				primitive: 'cylinder',
				dimensions: dimensions as Extract<
					ScenePrimitiveDimensions,
					{ radius: number; height: number }
				>
			};
		case 'sphere':
			return {
				...base,
				primitive: 'sphere',
				dimensions: dimensions as Extract<ScenePrimitiveDimensions, { radius: number }>
			};
	}
}

export function isPositiveFinite(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

export function normalizePrimitiveDimensions(
	kind: ScenePrimitiveKind,
	dimensions: ScenePrimitiveDimensions
): ScenePrimitiveEntity['dimensions'] | null {
	if (validatePrimitiveDimensions(kind, dimensions)) return null;
	switch (kind) {
		case 'box': {
			const dims = dimensions as SceneBoxDimensions;
			return { width: dims.width, height: dims.height, depth: dims.depth };
		}
		case 'plane': {
			const dims = dimensions as ScenePlaneDimensions;
			return { width: dims.width, height: dims.height };
		}
		case 'cylinder': {
			const dims = dimensions as SceneCylinderDimensions;
			return { radius: dims.radius, height: dims.height };
		}
		case 'sphere': {
			const dims = dimensions as SceneSphereDimensions;
			return { radius: dims.radius };
		}
	}
}

export function validatePrimitiveDimensions(
	kind: ScenePrimitiveKind,
	dimensions: ScenePrimitiveDimensions
): string | null {
	const keys = Object.keys(dimensions).sort();
	switch (kind) {
		case 'box': {
			const expected = ['depth', 'height', 'width'];
			if (keys.join() !== expected.join()) {
				return 'Box dimensions must include only width, height, and depth';
			}
			const dims = dimensions as SceneBoxDimensions;
			if (
				!isPositiveFinite(dims.width) ||
				!isPositiveFinite(dims.height) ||
				!isPositiveFinite(dims.depth)
			) {
				return 'Box dimensions must be finite and greater than zero';
			}
			return null;
		}
		case 'plane': {
			const expected = ['height', 'width'];
			if (keys.join() !== expected.join()) {
				return 'Plane dimensions must include only width and height';
			}
			const dims = dimensions as ScenePlaneDimensions;
			if (!isPositiveFinite(dims.width) || !isPositiveFinite(dims.height)) {
				return 'Plane dimensions must be finite and greater than zero';
			}
			return null;
		}
		case 'cylinder': {
			const expected = ['height', 'radius'];
			if (keys.join() !== expected.join()) {
				return 'Cylinder dimensions must include only radius and height';
			}
			const dims = dimensions as SceneCylinderDimensions;
			if (!isPositiveFinite(dims.radius) || !isPositiveFinite(dims.height)) {
				return 'Cylinder dimensions must be finite and greater than zero';
			}
			return null;
		}
		case 'sphere': {
			const expected = ['radius'];
			if (keys.join() !== expected.join()) {
				return 'Sphere dimensions must include only radius';
			}
			const dims = dimensions as SceneSphereDimensions;
			if (!isPositiveFinite(dims.radius)) {
				return 'Sphere radius must be finite and greater than zero';
			}
			return null;
		}
	}
}
