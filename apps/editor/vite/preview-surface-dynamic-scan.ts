/**
 * P21.4 review — computed dynamic-import detection for the preview-surface
 * boundary gate.
 *
 * The resolved module graph (`importedIds` / `dynamicallyImportedIds`) covers
 * aliases, `.svelte` modules, re-exports and *literal* dynamic imports, but a
 * computed `import(variable)` leaves no graph edge and could smuggle runtime
 * code past the closure walk. This scanner runs over the *transformed* module
 * source recorded by the plugin's `transform` hook and reports only
 * expression-form dynamics; literal dynamics (already graph edges) and
 * comments/strings are ignored.
 *
 * Deliberately a manual character scan, not a regex source parser: it never
 * resolves specifiers, only flags non-literal `import(` operators.
 */

function isIdentifierChar(char: string): boolean {
	return (
		(char >= 'a' && char <= 'z') ||
		(char >= 'A' && char <= 'Z') ||
		(char >= '0' && char <= '9') ||
		char === '_' ||
		char === '$'
	);
}

function isWhitespace(char: string): boolean {
	return (
		char === ' ' ||
		char === '\t' ||
		char === '\n' ||
		char === '\r' ||
		char === '\f' ||
		char === '\v'
	);
}

/**
 * Mask comments (spaces) and string/template literals (placeholder `\x01`,
 * newlines preserved) 1:1 so operator detection never fires inside them. The
 * placeholder keeps literal boundaries visible: a pure-literal argument reads
 * as placeholders-then-`)`, while concatenation (`'./' + name`) still shows
 * its operator. Handles `${...}` nesting in templates with a depth stack.
 */
export function maskCodeForDynamicScan(code: string): string {
	const out: string[] = new Array(code.length);
	type Frame =
		| { kind: 'normal' }
		| { kind: 'interp'; braces: number }
		| { kind: 'lineComment' }
		| { kind: 'blockComment' }
		| { kind: 'single' }
		| { kind: 'double' }
		| { kind: 'template' };
	const stack: Frame[] = [{ kind: 'normal' }];
	let i = 0;
	const top = () => stack[stack.length - 1]!;

	// Shared code-shape scanning for normal + interpolation frames. The only
	// difference: braces are plain characters at the top level but tracked
	// inside `${...}` so object literals cannot desync the template tracker.
	function scanCodeChar(char: string, next: string, frame: Frame): 'consumed' | 'plain' {
		if (char === '/' && next === '/') {
			out[i] = ' ';
			out[i + 1] = ' ';
			stack.push({ kind: 'lineComment' });
			i += 2;
			return 'consumed';
		}
		if (char === '/' && next === '*') {
			out[i] = ' ';
			out[i + 1] = ' ';
			stack.push({ kind: 'blockComment' });
			i += 2;
			return 'consumed';
		}
		if (char === "'") {
			out[i] = '';
			stack.push({ kind: 'single' });
			i += 1;
			return 'consumed';
		}
		if (char === '"') {
			out[i] = '';
			stack.push({ kind: 'double' });
			i += 1;
			return 'consumed';
		}
		if (char === '`') {
			out[i] = '';
			stack.push({ kind: 'template' });
			i += 1;
			return 'consumed';
		}
		if (frame.kind === 'interp') {
			if (char === '{') {
				frame.braces += 1;
				out[i] = char;
				i += 1;
				return 'consumed';
			}
			if (char === '}') {
				if (frame.braces === 0) {
					stack.pop();
					out[i] = '}';
					i += 1;
					return 'consumed';
				}
				frame.braces -= 1;
			}
		}
		return 'plain';
	}

	while (i < code.length) {
		const frame = top();
		const char = code[i]!;
		const next = code[i + 1] ?? '';

		if (frame.kind === 'lineComment') {
			out[i] = char === '\n' ? '\n' : ' ';
			if (char === '\n') stack.pop();
			i += 1;
			continue;
		}
		if (frame.kind === 'blockComment') {
			out[i] = char === '\n' ? '\n' : ' ';
			if (char === '*' && next === '/') {
				out[i + 1] = ' ';
				stack.pop();
				i += 2;
			} else {
				i += 1;
			}
			continue;
		}
		if (frame.kind === 'single' || frame.kind === 'double') {
			const quote = frame.kind === 'single' ? "'" : '"';
			out[i] = char === '\n' ? '\n' : '\x01';
			if (char === '\\') {
				if (i + 1 < code.length) out[i + 1] = code[i + 1] === '\n' ? '\n' : '\x01';
				i += 2;
				continue;
			}
			if (char === quote) stack.pop();
			i += 1;
			continue;
		}
		if (frame.kind === 'template') {
			if (char === '\\') {
				out[i] = '\x01';
				if (i + 1 < code.length) out[i + 1] = code[i + 1] === '\n' ? '\n' : '\x01';
				i += 2;
				continue;
			}
			if (char === '`') {
				out[i] = '\x01';
				stack.pop();
				i += 1;
				continue;
			}
			if (char === '$' && next === '{') {
				out[i] = ' ';
				out[i + 1] = ' ';
				stack.push({ kind: 'interp', braces: 0 });
				i += 2;
				continue;
			}
			out[i] = char === '\n' ? '\n' : '\x01';
			i += 1;
			continue;
		}
		if (frame.kind === 'normal' || frame.kind === 'interp') {
			if (scanCodeChar(char, next, frame) === 'consumed') continue;
			out[i] = char;
			i += 1;
			continue;
		}
		out[i] = char;
		i += 1;
	}
	return out.join('');
}

/** Raw specifier text of an expression-form dynamic import, capped for diagnostics. */
function readExpressionSpecifier(code: string, from: number): { text: string; end: number } {
	let depth = 1;
	let i = from;
	let inSingle = false;
	let inDouble = false;
	let inTemplate = false;
	let inLineComment = false;
	let inBlockComment = false;
	while (i < code.length && depth > 0) {
		const char = code[i]!;
		const next = code[i + 1] ?? '';
		if (inLineComment) {
			if (char === '\n') inLineComment = false;
			i += 1;
			continue;
		}
		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				i += 2;
				continue;
			}
			i += 1;
			continue;
		}
		if (inSingle) {
			if (char === '\\') {
				i += 2;
				continue;
			}
			if (char === "'") inSingle = false;
			i += 1;
			continue;
		}
		if (inDouble) {
			if (char === '\\') {
				i += 2;
				continue;
			}
			if (char === '"') inDouble = false;
			i += 1;
			continue;
		}
		if (inTemplate) {
			if (char === '\\') {
				i += 2;
				continue;
			}
			if (char === '`') inTemplate = false;
			i += 1;
			continue;
		}
		if (char === '/' && next === '/') {
			inLineComment = true;
			i += 2;
			continue;
		}
		if (char === '/' && next === '*') {
			inBlockComment = true;
			i += 2;
			continue;
		}
		if (char === "'") {
			inSingle = true;
			i += 1;
			continue;
		}
		if (char === '"') {
			inDouble = true;
			i += 1;
			continue;
		}
		if (char === '`') {
			inTemplate = true;
			i += 1;
			continue;
		}
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		i += 1;
	}
	return { text: code.slice(from, i - 1).trim().slice(0, 80), end: i };
}

/**
 * Report expression-form dynamic imports (`import(variable)`,
 * `import('./' + name)`, …) in transformed module source. Empty result means
 * every dynamic import in the module is a literal the graph already covers.
 */
export function findUnresolvedDynamicImports(code: string): string[] {
	const masked = maskCodeForDynamicScan(code);
	const found: string[] = [];
	let i = 0;
	while (i + 6 <= masked.length) {
		if (
			masked[i] === 'i' &&
			masked.slice(i, i + 6) === 'import' &&
			(i === 0 || (!isIdentifierChar(masked[i - 1]!) && masked[i - 1] !== '.'))
		) {
			let j = i + 6;
			while (j < masked.length && isWhitespace(masked[j]!)) j += 1;
			if (masked[j] === '(') {
				// Pure-literal arguments (strings/templates, now placeholders)
				// read as placeholders + whitespace up to `)` and are already
				// graph edges. Anything else is an expression Rollup cannot
				// resolve statically.
				let k = j + 1;
				while (
					k < masked.length &&
					(isWhitespace(masked[k]!) || masked[k] === '')
				)
					k += 1;
				if (masked[k] === ')') {
					// Literal specifier erased by masking — already a graph edge.
					i = k + 1;
					continue;
				}
				// Expression form: capture raw specifier text from the original
				// source starting at the first non-whitespace char.
				let start = j + 1;
				while (start < code.length && isWhitespace(code[start]!)) start += 1;
				const { text, end } = readExpressionSpecifier(code, start);
				found.push(text || '<empty>');
				i = end;
				continue;
			}
		}
		i += 1;
	}
	return found;
}

/** Collect unresolved dynamics across recorded transformed sources in a closure. */
export function collectUnresolvedDynamics(
	recordedCode: ReadonlyMap<string, string>,
	closureIds: ReadonlySet<string>
): Array<{ from: string; specifier: string }> {
	const unresolved: Array<{ from: string; specifier: string }> = [];
	for (const id of closureIds) {
		const code = recordedCode.get(id);
		if (code === undefined) continue;
		for (const specifier of findUnresolvedDynamicImports(code)) {
			unresolved.push({ from: id, specifier });
		}
	}
	return unresolved;
}
