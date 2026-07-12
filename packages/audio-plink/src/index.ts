export type PlinkKind = 'plink' | 'chalk';

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!ctx) {
		const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		ctx = new AC();
	}
	return ctx;
}

export function setMuted(value: boolean) {
	muted = value;
}

export function isMuted() {
	return muted;
}

export function playPlink(kind: PlinkKind = 'plink') {
	if (muted) return;
	const audio = getCtx();
	if (!audio) return;
	if (audio.state === 'suspended') void audio.resume();

	const now = audio.currentTime;
	const osc = audio.createOscillator();
	const gain = audio.createGain();
	osc.connect(gain);
	gain.connect(audio.destination);

	if (kind === 'chalk') {
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(420, now);
		osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
		osc.start(now);
		osc.stop(now + 0.14);
	} else {
		osc.type = 'sine';
		osc.frequency.setValueAtTime(880, now);
		osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
		osc.start(now);
		osc.stop(now + 0.2);
	}
}
