import { writeFileSync } from 'node:fs';
import { serializeBaseline } from './bench-report';
import { BASELINE_PATH, recordBaseline } from './record-baseline';

/**
 * CLI entry for `npm run bench:record`. Runs `recordBaseline()` and writes the
 * version-3 baseline to `g3-baseline.json`. Kept separate from the pure
 * `record-baseline.ts` module so importing the recorder (in tests or tooling)
 * never has a write side effect. `--full` includes the slow 1,000-room tier.
 */

const full = process.argv.includes('--full');
const baseline = recordBaseline({ full });
writeFileSync(BASELINE_PATH, serializeBaseline(baseline));

const first = baseline.tiers[0]?.provenance;
const tierSummary = baseline.tiers.map((tier) => `${tier.tier}:${tier.samples.length}`).join(' ');
console.log(`[record-baseline] wrote ${BASELINE_PATH}`);
console.log(`[record-baseline] method v${baseline.methodVersion} | tiers ${tierSummary}`);
console.log(
	`[record-baseline] sha=${first?.commitSha} treeDirty=${first?.treeDirty} contentHash=${first?.contentHash}`
);
