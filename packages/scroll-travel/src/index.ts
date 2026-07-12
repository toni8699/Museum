import { CatmullRomCurve3, Vector3 } from 'three';

export type Vec3 = [number, number, number];

export type CameraPathSample = {
	position: Vector3;
	lookAt: Vector3;
};

export type ProgressController = {
	/** Current damped progress 0..1 */
	get: () => number;
	/** Target progress before damping */
	getTarget: () => number;
	setProgress: (t: number) => void;
	jumpToSection: (index: number) => void;
	/** Call each frame with dt seconds */
	tick: (dt: number) => number;
	attach: (el: HTMLElement | Window) => () => void;
	sectionCount: number;
};

export type CreateProgressOptions = {
	sectionCount?: number;
	/** Higher = snappier follow */
	damp?: number;
	/** Wheel sensitivity */
	wheelScale?: number;
	/** Touch drag sensitivity */
	touchScale?: number;
	reducedMotion?: boolean;
};

function clamp01(n: number) {
	return Math.min(1, Math.max(0, n));
}

export function createProgress(options: CreateProgressOptions = {}): ProgressController {
	const sectionCount = options.sectionCount ?? 5;
	const damp = options.damp ?? 4.5;
	const wheelScale = options.wheelScale ?? 0.0012;
	const touchScale = options.touchScale ?? 0.0018;
	const reducedMotion = options.reducedMotion ?? false;

	let target = 0;
	let current = 0;
	let touchY = 0;

	const setProgress = (t: number) => {
		target = clamp01(t);
		if (reducedMotion) current = target;
	};

	const jumpToSection = (index: number) => {
		const i = Math.min(sectionCount - 1, Math.max(0, index));
		const t = sectionCount <= 1 ? 0 : i / (sectionCount - 1);
		setProgress(t);
	};

	const tick = (dt: number) => {
		if (reducedMotion) {
			current = target;
			return current;
		}
		const alpha = 1 - Math.exp(-damp * dt);
		current += (target - current) * alpha;
		if (Math.abs(target - current) < 0.00005) current = target;
		return current;
	};

	const attach = (el: HTMLElement | Window) => {
		const onWheel = (e: Event) => {
			const we = e as WheelEvent;
			we.preventDefault();
			target = clamp01(target + we.deltaY * wheelScale);
		};

		const onKey = (e: Event) => {
			const ke = e as KeyboardEvent;
			if (ke.key === 'ArrowDown' || ke.key === 'PageDown' || ke.key === ' ') {
				ke.preventDefault();
				if (reducedMotion) {
					const idx = Math.round(target * (sectionCount - 1));
					jumpToSection(idx + 1);
				} else {
					target = clamp01(target + 0.08);
				}
			} else if (ke.key === 'ArrowUp' || ke.key === 'PageUp') {
				ke.preventDefault();
				if (reducedMotion) {
					const idx = Math.round(target * (sectionCount - 1));
					jumpToSection(idx - 1);
				} else {
					target = clamp01(target - 0.08);
				}
			} else if (ke.key === 'Home') {
				jumpToSection(0);
			} else if (ke.key === 'End') {
				jumpToSection(sectionCount - 1);
			}
		};

		const onTouchStart = (e: Event) => {
			const te = e as TouchEvent;
			touchY = te.touches[0]?.clientY ?? 0;
		};

		const onTouchMove = (e: Event) => {
			const te = e as TouchEvent;
			const y = te.touches[0]?.clientY ?? touchY;
			const dy = touchY - y;
			touchY = y;
			target = clamp01(target + dy * touchScale);
			te.preventDefault();
		};

		const opts: AddEventListenerOptions = { passive: false };
		el.addEventListener('wheel', onWheel, opts);
		window.addEventListener('keydown', onKey);
		el.addEventListener('touchstart', onTouchStart, opts);
		el.addEventListener('touchmove', onTouchMove, opts);

		return () => {
			el.removeEventListener('wheel', onWheel);
			window.removeEventListener('keydown', onKey);
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('touchmove', onTouchMove);
		};
	};

	return {
		get: () => current,
		getTarget: () => target,
		setProgress,
		jumpToSection,
		tick,
		attach,
		sectionCount
	};
}

export function buildCameraPath(points: Vec3[], lookAts: Vec3[]) {
	if (points.length < 2) throw new Error('buildCameraPath needs at least 2 points');
	if (lookAts.length !== points.length) {
		throw new Error('lookAts length must match points length');
	}

	const posCurve = new CatmullRomCurve3(
		points.map((p) => new Vector3(...p)),
		false,
		'catmullrom',
		0.5
	);
	const lookCurve = new CatmullRomCurve3(
		lookAts.map((p) => new Vector3(...p)),
		false,
		'catmullrom',
		0.5
	);

	const position = new Vector3();
	const lookAt = new Vector3();

	return {
		sample(t: number): CameraPathSample {
			const u = clamp01(t);
			posCurve.getPoint(u, position);
			lookCurve.getPoint(u, lookAt);
			return { position: position.clone(), lookAt: lookAt.clone() };
		},
		sampleInto(t: number, outPos: Vector3, outLook: Vector3) {
			const u = clamp01(t);
			posCurve.getPoint(u, outPos);
			lookCurve.getPoint(u, outLook);
		}
	};
}

export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type SectionSubPath = {
	points: Vec3[];
	lookAts: Vec3[];
};

export type SectionTravelController = {
	sectionCount: number;
	getSectionIndex: () => number;
	getLocalProgress: () => number;
	getLocalTarget: () => number;
	getYaw: () => number;
	/** True while camera is blending between sections */
	isBlending: () => boolean;
	enterSection: (index: number, local?: number) => void;
	jumpToSection: (index: number) => void;
	setLocalProgress: (t: number) => void;
	setYaw: (yaw: number) => void;
	tick: (dt: number) => void;
	attach: (el: HTMLElement | Window) => () => void;
	/** Sample active section path and apply yaw around world up. */
	sampleInto: (outPos: Vector3, outLook: Vector3) => void;
};

export type CreateSectionTravelOptions = {
	sectionCount: number;
	getSubPath: (sectionIndex: number) => SectionSubPath;
	damp?: number;
	yawDamp?: number;
	/** Blend damp when switching sections (lower = smoother/slower) */
	blendDamp?: number;
	wheelScale?: number;
	touchScale?: number;
	yawScale?: number;
	/** Max |yaw| in radians */
	yawLimit?: number;
	/** Extra local progress past 0/1 before switching section */
	overscrollToSwitch?: number;
	reducedMotion?: boolean;
	/** Per-section yaw limits; falls back to yawLimit */
	yawLimitForSection?: (sectionIndex: number) => number;
};

export function createSectionTravel(
	options: CreateSectionTravelOptions
): SectionTravelController {
	const sectionCount = options.sectionCount;
	const damp = options.damp ?? 3.0;
	const yawDamp = options.yawDamp ?? 5;
	const blendDamp = options.blendDamp ?? 2.0;
	const wheelScale = options.wheelScale ?? 0.0012;
	const touchScale = options.touchScale ?? 0.0018;
	const yawScale = options.yawScale ?? 0.0022;
	const defaultYawLimit = options.yawLimit ?? 0.55;
	const overscrollToSwitch = options.overscrollToSwitch ?? 0.16;
	const reducedMotion = options.reducedMotion ?? false;

	let sectionIndex = 0;
	let localTarget = 0;
	let localCurrent = 0;
	let yawTarget = 0;
	let yawCurrent = 0;
	let edgeDebt = 0;
	let touchX = 0;
	let touchY = 0;

	let blending = false;
	let blendT = 1;
	const blendFromPos = new Vector3();
	const blendFromLook = new Vector3();
	const blendToPos = new Vector3();
	const blendToLook = new Vector3();
	const sampleLook = new Vector3();

	const paths = Array.from({ length: sectionCount }, (_, i) => {
		const sub = options.getSubPath(i);
		return buildCameraPath(sub.points, sub.lookAts);
	});

	const yawLimitNow = () =>
		options.yawLimitForSection?.(sectionIndex) ?? defaultYawLimit;

	const clampYaw = (y: number) => {
		const lim = yawLimitNow();
		return Math.min(lim, Math.max(-lim, y));
	};

	const applyYawToLook = (pos: Vector3, look: Vector3, outLook: Vector3) => {
		const ox = look.x - pos.x;
		const oy = look.y - pos.y;
		const oz = look.z - pos.z;
		const cos = Math.cos(yawCurrent);
		const sin = Math.sin(yawCurrent);
		outLook.set(pos.x + ox * cos - oz * sin, pos.y + oy, pos.z + ox * sin + oz * cos);
	};

	const captureCurrentSample = (outPos: Vector3, outLook: Vector3) => {
		if (blending && blendT < 1) {
			outPos.lerpVectors(blendFromPos, blendToPos, blendT);
			outLook.lerpVectors(blendFromLook, blendToLook, blendT);
			return;
		}
		const path = paths[sectionIndex] ?? paths[0];
		path.sampleInto(localCurrent, outPos, sampleLook);
		applyYawToLook(outPos, sampleLook, outLook);
	};

	const beginBlendTo = (nextIndex: number, local: number) => {
		const next = Math.min(sectionCount - 1, Math.max(0, nextIndex));
		if (next === sectionIndex && Math.abs(local - localTarget) < 0.001) return;

		captureCurrentSample(blendFromPos, blendFromLook);

		sectionIndex = next;
		localTarget = clamp01(local);
		localCurrent = localTarget;
		yawTarget = 0;
		yawCurrent = 0;
		edgeDebt = 0;

		const path = paths[sectionIndex] ?? paths[0];
		path.sampleInto(localCurrent, blendToPos, blendToLook);

		if (reducedMotion) {
			blending = false;
			blendT = 1;
			return;
		}

		blending = true;
		blendT = 0;
	};

	const enterSection = (index: number, local = 0) => {
		beginBlendTo(index, local);
	};

	const jumpToSection = (index: number) => enterSection(index, 0);

	const setLocalProgress = (t: number) => {
		if (blending) return;
		localTarget = clamp01(t);
		if (reducedMotion) localCurrent = localTarget;
	};

	const setYaw = (yaw: number) => {
		yawTarget = clampYaw(yaw);
		if (reducedMotion) yawCurrent = yawTarget;
	};

	const applyVerticalDelta = (delta: number) => {
		if (blending) return;
		const next = localTarget + delta;
		if (next > 1) {
			edgeDebt += next - 1;
			localTarget = 1;
			if (edgeDebt >= overscrollToSwitch && sectionIndex < sectionCount - 1) {
				enterSection(sectionIndex + 1, 0);
			}
		} else if (next < 0) {
			edgeDebt += -next;
			localTarget = 0;
			if (edgeDebt >= overscrollToSwitch && sectionIndex > 0) {
				enterSection(sectionIndex - 1, 1);
			}
		} else {
			edgeDebt = 0;
			localTarget = next;
		}
		if (reducedMotion) localCurrent = localTarget;
	};

	const applyYawDelta = (delta: number) => {
		if (blending) return;
		yawTarget = clampYaw(yawTarget + delta);
		if (reducedMotion) yawCurrent = yawTarget;
	};

	const tick = (dt: number) => {
		if (reducedMotion) {
			localCurrent = localTarget;
			yawCurrent = yawTarget;
			blending = false;
			blendT = 1;
			return;
		}

		if (blending) {
			const bAlpha = 1 - Math.exp(-blendDamp * dt);
			blendT = Math.min(1, blendT + bAlpha);
			if (blendT >= 0.995) {
				blendT = 1;
				blending = false;
			}
			return;
		}

		const alpha = 1 - Math.exp(-damp * dt);
		const yAlpha = 1 - Math.exp(-yawDamp * dt);
		localCurrent += (localTarget - localCurrent) * alpha;
		yawCurrent += (yawTarget - yawCurrent) * yAlpha;
		if (Math.abs(localTarget - localCurrent) < 0.00005) localCurrent = localTarget;
		if (Math.abs(yawTarget - yawCurrent) < 0.00005) yawCurrent = yawTarget;
	};

	const sampleInto = (outPos: Vector3, outLook: Vector3) => {
		if (blending && blendT < 1) {
			outPos.lerpVectors(blendFromPos, blendToPos, blendT);
			outLook.lerpVectors(blendFromLook, blendToLook, blendT);
			return;
		}
		const path = paths[sectionIndex] ?? paths[0];
		path.sampleInto(localCurrent, outPos, sampleLook);
		applyYawToLook(outPos, sampleLook, outLook);
	};

	const attach = (el: HTMLElement | Window) => {
		const onWheel = (e: Event) => {
			const we = e as WheelEvent;
			we.preventDefault();
			const absX = Math.abs(we.deltaX);
			const absY = Math.abs(we.deltaY);
			if (we.shiftKey || absX > absY) {
				applyYawDelta((we.shiftKey ? we.deltaY : we.deltaX) * yawScale);
			} else {
				applyVerticalDelta(we.deltaY * wheelScale);
			}
		};

		const onKey = (e: Event) => {
			const ke = e as KeyboardEvent;
			if (ke.key === 'ArrowDown' || ke.key === 'PageDown' || ke.key === ' ') {
				ke.preventDefault();
				applyVerticalDelta(reducedMotion ? 1.1 : 0.07);
			} else if (ke.key === 'ArrowUp' || ke.key === 'PageUp') {
				ke.preventDefault();
				applyVerticalDelta(reducedMotion ? -1.1 : -0.07);
			} else if (ke.key === 'ArrowLeft') {
				ke.preventDefault();
				applyYawDelta(-0.1);
			} else if (ke.key === 'ArrowRight') {
				ke.preventDefault();
				applyYawDelta(0.1);
			} else if (ke.key === 'Home') {
				jumpToSection(0);
			} else if (ke.key === 'End') {
				jumpToSection(sectionCount - 1);
			}
		};

		const onTouchStart = (e: Event) => {
			const te = e as TouchEvent;
			touchX = te.touches[0]?.clientX ?? 0;
			touchY = te.touches[0]?.clientY ?? 0;
		};

		const onTouchMove = (e: Event) => {
			const te = e as TouchEvent;
			const x = te.touches[0]?.clientX ?? touchX;
			const y = te.touches[0]?.clientY ?? touchY;
			const dx = touchX - x;
			const dy = touchY - y;
			touchX = x;
			touchY = y;
			te.preventDefault();
			if (Math.abs(dx) > Math.abs(dy)) {
				applyYawDelta(dx * yawScale * 1.2);
			} else {
				applyVerticalDelta(dy * touchScale);
			}
		};

		const opts: AddEventListenerOptions = { passive: false };
		el.addEventListener('wheel', onWheel, opts);
		window.addEventListener('keydown', onKey);
		el.addEventListener('touchstart', onTouchStart, opts);
		el.addEventListener('touchmove', onTouchMove, opts);

		return () => {
			el.removeEventListener('wheel', onWheel);
			window.removeEventListener('keydown', onKey);
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('touchmove', onTouchMove);
		};
	};

	return {
		sectionCount,
		getSectionIndex: () => sectionIndex,
		getLocalProgress: () => localCurrent,
		getLocalTarget: () => localTarget,
		getYaw: () => yawCurrent,
		isBlending: () => blending,
		enterSection,
		jumpToSection,
		setLocalProgress,
		setYaw,
		tick,
		attach,
		sampleInto
	};
}
