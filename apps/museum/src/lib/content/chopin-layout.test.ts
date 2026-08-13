import { describe, expect, it } from 'vitest';
import { chopinLayout, chopinLayoutJson } from './chopin-layout';
import { roomsToLayout } from './rooms-to-layout';
import { serializeLayoutDocument, validateLayoutDocument } from '$lib/layout/layout-codec';

describe('Chopin layout fixture', () => {
  it('is canonical v2 and matches compiler output byte-for-byte', () => {
    expect(chopinLayout.formatVersion).toBe(2);
    expect(chopinLayoutJson).toBe(serializeLayoutDocument(roomsToLayout()));
    expect(validateLayoutDocument(chopinLayout).success).toBe(true);
  });
});
