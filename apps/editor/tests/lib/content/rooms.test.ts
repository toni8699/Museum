import { describe, expect, it } from 'vitest';
import { getRoom, isWorldPointInsideRoomXZ, roomPoint } from '$lib/content/rooms';

describe('isWorldPointInsideRoomXZ', () => {
  it('uses inclusive yaw-aware room bounds', () => {
    const room = getRoom('paris');
    const halfWidth = room.dimensions[0] / 2;
    const halfDepth = room.dimensions[2] / 2;

    expect(isWorldPointInsideRoomXZ('paris', roomPoint('paris', [0, 0, 0]))).toBe(true);
    expect(
      isWorldPointInsideRoomXZ('paris', roomPoint('paris', [halfWidth, 5, halfDepth]))
    ).toBe(true);
    expect(
      isWorldPointInsideRoomXZ('paris', roomPoint('paris', [-halfWidth, -5, -halfDepth]))
    ).toBe(true);
    expect(
      isWorldPointInsideRoomXZ('paris', roomPoint('paris', [halfWidth + 2e-6, 0, 0]))
    ).toBe(false);
    expect(
      isWorldPointInsideRoomXZ('paris', roomPoint('paris', [0, 0, halfDepth + 2e-6]))
    ).toBe(false);
  });

  it('includes the default epsilon and ignores world Y', () => {
    const halfWidth = getRoom('paris').dimensions[0] / 2;
    const nearBoundaryLow = roomPoint('paris', [halfWidth + 5e-7, -10_000, 0]);
    const nearBoundaryHigh = roomPoint('paris', [halfWidth + 5e-7, 10_000, 0]);

    expect(isWorldPointInsideRoomXZ('paris', nearBoundaryLow)).toBe(true);
    expect(isWorldPointInsideRoomXZ('paris', nearBoundaryHigh)).toBe(true);
  });
});
