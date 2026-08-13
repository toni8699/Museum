import { roomsToLayout } from './rooms-to-layout';
import { serializeLayoutDocument, validateLayoutDocument } from '$lib/layout/layout-codec';
import type { LayoutDocument } from '$lib/layout/layout-types';

const compiled = roomsToLayout();
const validation = validateLayoutDocument(compiled);
if (!validation.success) throw new Error(`Invalid Chopin layout fixture: ${validation.issues[0]!.message}`);

/** Canonical v2 fixture produced by the explicit rooms.ts compiler. */
export const chopinLayout: LayoutDocument = validation.document;
export const chopinLayoutJson = serializeLayoutDocument(chopinLayout);
