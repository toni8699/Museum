import { chopinProject } from './chopin-project';
import { serializeLayoutDocument } from '$lib/layout/layout-codec';
import type { LayoutDocument } from '$lib/layout/layout-types';

/** @deprecated Compatibility alias of canonical project layout. */
export const chopinLayout: LayoutDocument = chopinProject.layout;
export const chopinLayoutJson = serializeLayoutDocument(chopinLayout);
