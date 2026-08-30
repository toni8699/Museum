import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_EASING,
  CAMERA_FOV,
  createCameraMotionSample,
  getNode,
  type CameraGraph,
  type CameraGraphNode
} from '@portfolio/camera-core';

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const packageSrc = resolve(appSrc, '../../../packages/camera-core/src');
const museumSrc = resolve(appSrc, 'lib/museum');

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const file = pending.pop()!;
    const stat = statSync(file);
    if (stat.isDirectory()) {
      for (const child of readdirSync(file)) {
        if (!child.startsWith('.')) pending.push(resolve(file, child));
      }
    } else if (file.endsWith('.ts') || file.endsWith('.svelte')) {
      files.push(file);
    }
  }
  return files;
}

describe('camera-core package boundary', () => {
  it('exposes the camera API directly without an app shim', () => {
    const node: CameraGraphNode = {
      id: 'node',
      roomId: 'room',
      label: 'Node',
      position: [0, 1, 0],
      cameraTarget: [0, 1, 1],
      fov: CAMERA_FOV.default,
      connectedNodeIds: []
    };
    const graph: CameraGraph = {
      navigationNodes: [node],
      connections: [],
      nodeById: new Map([[node.id, node]])
    };

    expect(CAMERA_EASING).toContain('smootherstep');
    expect(createCameraMotionSample().fov).toBe(CAMERA_FOV.default);
    expect(getNode(node.id, graph)).toBe(node);
  });

  it('keeps package sources headless and independent from app/editor code', () => {
    const files = ['index.ts', 'camera-motion.ts', 'camera-route.ts', 'navigation.ts', 'scene-types.ts'];
    for (const file of files) {
      expect(existsSync(resolve(packageSrc, file))).toBe(true);
      const source = readFileSync(resolve(packageSrc, file), 'utf8');
      expect(source, file).not.toMatch(
        /(?:from|import\()\s*['"][^'"]*(?:\$lib|chopin-project|@threlte|svelte)(?:\/|['"])/
      );
      expect(source, file).not.toMatch(/@portfolio\/project-model/);
      expect(source, file).not.toMatch(
        /(?:from|import\()\s*['"](?:three\/(?:addons|examples)|@threlte|svelte)/
      );
    }
  });

  it('keeps the visitor museum source free of editor imports', () => {
    for (const file of sourceFiles(museumSrc)) {
      const source = readFileSync(file, 'utf8');
      expect(file).not.toMatch(/\/editor\//);
      expect(source, file).not.toMatch(
        /(?:from|import\()\s*['"][^'"]*(?:\$lib\/editor|(?:\.\.?\/)\.?editor\/)/
      );
    }
  });
});
