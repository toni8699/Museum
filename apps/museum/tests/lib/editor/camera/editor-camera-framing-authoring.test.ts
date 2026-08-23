import { describe, expect, it } from 'vitest';
import {
	CAMERA_FOCUS_TIMING_PRESETS,
	FOCUS_TIMING_PRESET_ORDER,
	FOCUS_TIMING_PRESET_LABELS,
	CENTERED_SEED,
	CAMERA_LENS_PRESETS,
	focalLengthMmToFovDegrees,
	findMatchingLensPreset,
	FOV_COPY,
	mirrorFramingEnvelope,
	mirrorFramingEnvelopeInvolutory,
	isClampedOrderedEnvelope,
	clampEnvelopeHandle,
	exitEndLabel,
	ENVELOPE_HANDLE_LABELS,
	CAMERA_FRAMING_AUTHORING_COMFORT,
	stepLensChangeDiagnostic,
	rapidLensChangeDiagnostic,
	parallaxTurnDiagnostic,
	targetPassesCloseDiagnostic,
	dedupeFramingDiagnostics,
	type CameraFramingDiagnostic,
	type FocusTimingPresetName
} from '$lib/editor/camera/editor-camera-framing-authoring';
import type { CameraFramingEnvelope } from '$lib/content/scene';

describe('focus-timing presets', () => {
	it('has exactly three named presets in canonical order', () => {
		expect(FOCUS_TIMING_PRESET_ORDER).toEqual(['early', 'centered', 'full']);
	});

	it('centered is the first-key seed with exitEnd = 1', () => {
		expect(CENTERED_SEED).toEqual({ enterStart: 0.25, enterEnd: 0.5, exitStart: 1, exitEnd: 1 });
		expect(CENTERED_SEED.exitEnd).toBe(1);
	});

	it('early preset has smaller enter bounds than centered', () => {
		const early = CAMERA_FOCUS_TIMING_PRESETS.early;
		const centered = CAMERA_FOCUS_TIMING_PRESETS.centered;
		expect(early.enterStart).toBeLessThan(centered.enterStart);
		expect(early.enterEnd).toBeLessThan(centered.enterEnd);
	});

	it('full Move preset has zero-width enter ramp', () => {
		const full = CAMERA_FOCUS_TIMING_PRESETS.full;
		expect(full.enterStart).toBe(0);
		expect(full.enterEnd).toBe(0);
		expect(full.exitStart).toBe(1);
		expect(full.exitEnd).toBe(1);
	});

	it('all presets have exitEnd = 1', () => {
		for (const name of FOCUS_TIMING_PRESET_ORDER) {
			expect(CAMERA_FOCUS_TIMING_PRESETS[name].exitEnd).toBe(1);
		}
	});

	it('has human-readable labels for each preset', () => {
		expect(FOCUS_TIMING_PRESET_LABELS.early).toBe('Early');
		expect(FOCUS_TIMING_PRESET_LABELS.centered).toBe('Centered');
		expect(FOCUS_TIMING_PRESET_LABELS.full).toBe('Full Move');
	});
});

describe('lens presets', () => {
	it('has exactly three lens presets', () => {
		expect(CAMERA_LENS_PRESETS).toHaveLength(3);
	});

	it('24 mm wide produces approximately 53.13° vertical FOV', () => {
		const wide = CAMERA_LENS_PRESETS.find((p) => p.name === 'wide')!;
		expect(wide.focalLengthMm).toBe(24);
		expect(wide.verticalFovDegrees).toBeCloseTo(53.13, 1);
	});

	it('50 mm standard produces approximately 26.99° vertical FOV', () => {
		const standard = CAMERA_LENS_PRESETS.find((p) => p.name === 'standard')!;
		expect(standard.focalLengthMm).toBe(50);
		expect(standard.verticalFovDegrees).toBeCloseTo(26.99, 1);
	});

	it('85 mm tight produces approximately 16.07° vertical FOV', () => {
		const tight = CAMERA_LENS_PRESETS.find((p) => p.name === 'tight')!;
		expect(tight.focalLengthMm).toBe(85);
		expect(tight.verticalFovDegrees).toBeCloseTo(16.07, 1);
	});

	it('focalLengthMmToFovDegrees matches preset values', () => {
		for (const preset of CAMERA_LENS_PRESETS) {
			expect(focalLengthMmToFovDegrees(preset.focalLengthMm)).toBeCloseTo(
				preset.verticalFovDegrees,
				6
			);
		}
	});

	it('focalLengthMmToFovDegrees rejects non-positive values', () => {
		expect(() => focalLengthMmToFovDegrees(0)).toThrow('positive finite number');
		expect(() => focalLengthMmToFovDegrees(-10)).toThrow('positive finite number');
		expect(() => focalLengthMmToFovDegrees(Number.NaN)).toThrow('positive finite number');
	});

	it('findMatchingLensPreset matches exact preset values', () => {
		const wide = CAMERA_LENS_PRESETS.find((p) => p.name === 'wide')!;
		expect(findMatchingLensPreset(wide.verticalFovDegrees)?.name).toBe('wide');
	});

	it('findMatchingLensPreset returns null for non-preset values', () => {
		expect(findMatchingLensPreset(42)).toBeNull();
	});

	it('FOV copy contains both larger/wider and smaller/tighter', () => {
		expect(FOV_COPY.largerWider).toContain('wider');
		expect(FOV_COPY.smallerTighter).toContain('tighter');
	});
});

describe('envelope mirroring', () => {
	it('mirror is involutive (mirror(mirror(e)) === e)', () => {
		const envelope: CameraFramingEnvelope = { enterStart: 0.1, enterEnd: 0.3, exitStart: 0.7, exitEnd: 0.9 };
		expect(mirrorFramingEnvelopeInvolutory(envelope)).toBe(true);
	});

	it('mirror of a centered envelope flips bounds correctly', () => {
		const centered: CameraFramingEnvelope = { enterStart: 0.25, enterEnd: 0.5, exitStart: 1, exitEnd: 1 };
		const mirrored = mirrorFramingEnvelope(centered);
		expect(mirrored).toEqual({ enterStart: 0, enterEnd: 0, exitStart: 0.5, exitEnd: 0.75 });
	});

	it('mirror of a zero-width ramp stays zero-width', () => {
		const full: CameraFramingEnvelope = { enterStart: 0, enterEnd: 0, exitStart: 1, exitEnd: 1 };
		const mirrored = mirrorFramingEnvelope(full);
		expect(mirrored).toEqual({ enterStart: 0, enterEnd: 0, exitStart: 1, exitEnd: 1 });
	});

	it('mirror is involutive for various envelopes', () => {
		const envelopes: CameraFramingEnvelope[] = [
			{ enterStart: 0, enterEnd: 0, exitStart: 1, exitEnd: 1 },
			{ enterStart: 0.05, enterEnd: 0.2, exitStart: 1, exitEnd: 1 },
			{ enterStart: 0.1, enterEnd: 0.3, exitStart: 0.7, exitEnd: 0.9 },
			{ enterStart: 0.5, enterEnd: 0.5, exitStart: 0.5, exitEnd: 0.5 }
		];
		for (const e of envelopes) {
			expect(mirrorFramingEnvelopeInvolutory(e)).toBe(true);
		}
	});
});

describe('handle clamping', () => {
	it('accepts valid ordered envelope', () => {
		expect(isClampedOrderedEnvelope({ enterStart: 0, enterEnd: 0.5, exitStart: 0.5, exitEnd: 1 })).toBe(true);
	});

	it('rejects un-ordered envelope', () => {
		expect(isClampedOrderedEnvelope({ enterStart: 0.5, enterEnd: 0.3, exitStart: 0.5, exitEnd: 1 })).toBe(false);
	});

	it('clampEnvelopeHandle returns valid envelope for legal value', () => {
		const current: CameraFramingEnvelope = { enterStart: 0.1, enterEnd: 0.3, exitStart: 0.7, exitEnd: 0.9 };
		const result = clampEnvelopeHandle(current, 'enterStart', 0.2);
		expect(result).toEqual({ enterStart: 0.2, enterEnd: 0.3, exitStart: 0.7, exitEnd: 0.9 });
	});

	it('clampEnvelopeHandle returns null for value that breaks ordering', () => {
		const current: CameraFramingEnvelope = { enterStart: 0.1, enterEnd: 0.3, exitStart: 0.7, exitEnd: 0.9 };
		const result = clampEnvelopeHandle(current, 'enterStart', 0.5);
		expect(result).toBeNull();
	});

	it('clampEnvelopeHandle returns null for non-finite value', () => {
		const current: CameraFramingEnvelope = { enterStart: 0.1, enterEnd: 0.3, exitStart: 0.7, exitEnd: 0.9 };
		expect(clampEnvelopeHandle(current, 'enterStart', Number.NaN)).toBeNull();
		expect(clampEnvelopeHandle(current, 'enterStart', -0.1)).toBeNull();
	});

	it('exitEndLabel shows "Authored through arrival" when value >= 1', () => {
		expect(exitEndLabel(1)).toBe('Authored through arrival');
		expect(exitEndLabel(1.5)).toBe('Authored through arrival');
	});

	it('exitEndLabel shows percentage for values < 1', () => {
		expect(exitEndLabel(0.5)).toBe('50%');
		expect(exitEndLabel(0.75)).toBe('75%');
	});
});

describe('comfort policy constants', () => {
	it('minFovRampSeconds is 0.6', () => {
		expect(CAMERA_FRAMING_AUTHORING_COMFORT.minFovRampSeconds).toBe(0.6);
	});

	it('maxFovRateDegreesPerSecond is 30', () => {
		expect(CAMERA_FRAMING_AUTHORING_COMFORT.maxFovRateDegreesPerSecond).toBe(30);
	});

	it('diagnosticSamplesPerRamp is 96', () => {
		expect(CAMERA_FRAMING_AUTHORING_COMFORT.diagnosticSamplesPerRamp).toBe(96);
	});
});

describe('comfort diagnostics', () => {
	it('stepLensChangeDiagnostic formats correctly', () => {
		const d = stepLensChangeDiagnostic('enter');
		expect(d.kind).toBe('step-lens-change');
		expect(d.message).toContain('Step lens change');
		expect(d.message).toContain('enter');
	});

	it('rapidLensChangeDiagnostic includes rate and time', () => {
		const d = rapidLensChangeDiagnostic(45.2, 0.3);
		expect(d.kind).toBe('rapid-lens-change');
		expect(d.message).toContain('45.2');
		expect(d.message).toContain('0.30');
		expect(d.measuredValue).toBe(45.2);
	});

	it('parallaxTurnDiagnostic has correct kind', () => {
		const d = parallaxTurnDiagnostic();
		expect(d.kind).toBe('parallax-turn-softened');
	});

	it('targetPassesCloseDiagnostic has correct kind', () => {
		const d = targetPassesCloseDiagnostic();
		expect(d.kind).toBe('target-passes-close');
	});
});

describe('diagnostic deduplication', () => {
	it('keeps one diagnostic per kind, preserving first-occurrence order', () => {
		const diagnostics = dedupeFramingDiagnostics([
			parallaxTurnDiagnostic(),
			targetPassesCloseDiagnostic(),
			parallaxTurnDiagnostic(),
			rapidLensChangeDiagnostic(45.2, 0.3),
			stepLensChangeDiagnostic('enter'),
			targetPassesCloseDiagnostic()
		]);
		expect(diagnostics).toEqual([
			parallaxTurnDiagnostic(),
			targetPassesCloseDiagnostic(),
			rapidLensChangeDiagnostic(45.2, 0.3),
			stepLensChangeDiagnostic('enter')
		]);
	});

	it('collapses overlapping parallax hints into a single row', () => {
		// Angular-rate limiting and a bypass may both be active on one edge;
		// both produce the same kind and must render as exactly one row.
		const diagnostics = dedupeFramingDiagnostics([
			parallaxTurnDiagnostic(),
			parallaxTurnDiagnostic()
		]);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toEqual(parallaxTurnDiagnostic());
	});

	it('returns an empty array for no diagnostics', () => {
		expect(dedupeFramingDiagnostics([])).toEqual([]);
	});
});
