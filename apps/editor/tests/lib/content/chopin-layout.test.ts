import { describe, expect, it } from 'vitest';
import { chopinLayout, chopinLayoutJson } from '$lib/content/chopin-layout';
import { chopinProject } from '$lib/content/chopin-project';
import { serializeLayoutDocument, validateLayoutDocument } from '$lib/layout/layout-codec';

describe('Chopin layout fixture', () => {
  it('is a canonical compatibility alias of the project layout', () => {
    expect(chopinLayout).toBe(chopinProject.layout);
    expect(chopinLayoutJson).toBe(serializeLayoutDocument(chopinProject.layout));
    expect(validateLayoutDocument(chopinLayout).success).toBe(true);
  });
});
