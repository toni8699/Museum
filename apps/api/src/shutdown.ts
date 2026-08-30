import type { FastifyInstance } from 'fastify';

export type ShutdownProcess = {
	once(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
	exitCode?: number;
};

export function installShutdownHandlers(
	app: Pick<FastifyInstance, 'close'>,
	processLike: ShutdownProcess = process
): () => Promise<void> {
	let closePromise: Promise<void> | undefined;
	const closeOnce = () => {
		closePromise ??= Promise.resolve().then(() => app.close());
		return closePromise;
	};
	const handleSignal = () => {
		void closeOnce().catch(() => {
			processLike.exitCode = 1;
		});
	};

	processLike.once('SIGTERM', handleSignal);
	processLike.once('SIGINT', handleSignal);
	return closeOnce;
}
