export type Project = {
	id: string;
	title: string;
	blurb: string;
	tags: string[];
	link?: string;
};

export type Skill = {
	id: string;
	label: string;
};

export type Links = {
	github?: string;
	channel?: string;
	email?: string;
	website?: string;
};

export type Portfolio = {
	name: string;
	role: string;
	tagline: string;
	bio: string;
	projects: Project[];
	skills: Skill[];
	links: Links;
	sections: { id: string; label: string }[];
};

export const tonyBase = {
	name: 'Tony',
	links: {
		github: 'https://github.com',
		channel: 'https://youtube.com',
		email: 'hello@example.com'
	} satisfies Links,
	projects: [
		{
			id: 'edu-channel',
			title: 'Professor Brownie',
			blurb: 'Education channel that makes hard ideas feel like snack time.',
			tags: ['education', 'video', 'brand'],
			link: 'https://youtube.com'
		},
		{
			id: 'interactive-web',
			title: 'Scroll-as-Travel Sites',
			blurb: 'Immersive web experiences where the camera walks into the story.',
			tags: ['svelte', 'three.js', 'ux']
		},
		{
			id: 'learning-tools',
			title: 'Classroom Tools',
			blurb: 'Small interactive lessons for curious minds.',
			tags: ['teaching', 'js', 'design']
		}
	] satisfies Project[],
	skills: [
		{ id: 'svelte', label: 'Svelte / SvelteKit' },
		{ id: 'three', label: 'Three.js / Threlte' },
		{ id: 'ts', label: 'TypeScript' },
		{ id: 'edu', label: 'Education design' },
		{ id: 'music', label: 'Classical music' },
		{ id: 'video', label: 'Video & storytelling' }
	] satisfies Skill[]
};

export const SECTIONS = [
	{ id: 'hero', label: 'Enter' },
	{ id: 'work', label: 'Work' },
	{ id: 'gallery', label: 'Gallery' },
	{ id: 'skills', label: 'Skills' },
	{ id: 'contact', label: 'Contact' }
] as const;

export function chopinCopy(): Portfolio {
	return {
		name: tonyBase.name,
		role: 'Composer of code',
		tagline: 'Notes become interfaces. Silence becomes space.',
		bio: 'Tony builds lyrical software — precise like a nocturne, curious like a first rehearsal. Classical music shapes how he paces interaction and atmosphere on the web.',
		projects: tonyBase.projects.map((p) => {
			if (p.id === 'edu-channel') {
				return {
					...p,
					title: 'Nocturne Lessons',
					blurb: 'An education channel scored like a salon recital — clarity with warmth.'
				};
			}
			if (p.id === 'interactive-web') {
				return {
					...p,
					title: 'Salon Journeys',
					blurb: 'Camera paths that feel like walking into a candlelit room of work.'
				};
			}
			return {
				...p,
				title: 'Etudes for Learners',
				blurb: 'Short interactive études that teach by playing, not preaching.'
			};
		}),
		skills: tonyBase.skills,
		links: tonyBase.links,
		sections: [...SECTIONS]
	};
}

export function brownieCopy(): Portfolio {
	return {
		name: tonyBase.name,
		role: 'Professor Brownie',
		tagline: 'Class is in session. Bring your curiosity — and maybe a cookie.',
		bio: "Tony teaches as Professor Brownie: a brownie in glasses and a tie who turns tough topics into classroom adventures. Same brain, stick arms, big heart for learning.",
		projects: tonyBase.projects.map((p) => {
			if (p.id === 'edu-channel') {
				return {
					...p,
					title: 'Cookie Classroom',
					blurb: 'The channel HQ — lessons, chalk talks, and snack-sized breakthroughs.'
				};
			}
			if (p.id === 'interactive-web') {
				return {
					...p,
					title: 'Hallway Field Trips',
					blurb: 'Web scenes you walk through like a school tour of projects.'
				};
			}
			return {
				...p,
				title: 'Desk Experiments',
				blurb: 'Hands-on mini labs that live between the desks.'
			};
		}),
		skills: tonyBase.skills,
		links: tonyBase.links,
		sections: [...SECTIONS]
	};
}

export function sectionIndexFromProgress(progress: number, count = SECTIONS.length): number {
	const t = Math.min(1, Math.max(0, progress));
	return Math.min(count - 1, Math.floor(t * count));
}
