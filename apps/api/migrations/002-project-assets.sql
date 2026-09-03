CREATE TABLE IF NOT EXISTS assets (
	id uuid PRIMARY KEY,
	project_id text NOT NULL REFERENCES projects(id),
	name text NOT NULL CHECK (
		char_length(name) BETWEEN 1 AND 128 AND name = btrim(name)
		AND position('/' in name) = 0 AND position(chr(92) in name) = 0
	),
	kind text NOT NULL CHECK (kind IN ('texture', 'procedural')),
	storage_kind text NOT NULL CHECK (storage_kind IN ('r2', 'none')),
	source_kind text NOT NULL CHECK (source_kind IN ('upload', 'builtin', 'procedural')),
	source_ref text,
	mime text CHECK (mime IN ('image/png', 'image/webp', 'image/jpeg')),
	byte_size bigint CHECK (byte_size BETWEEN 1 AND 26214400),
	sha256 text CHECK (sha256 ~ '^sha256-[0-9a-f]{64}$'),
	object_key text UNIQUE,
	import_state text NOT NULL CHECK (import_state IN ('pending', 'ready', 'failed')),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CHECK (
		(storage_kind = 'r2' AND object_key IS NOT NULL AND source_kind = 'upload')
		OR (storage_kind = 'none' AND object_key IS NULL
			AND source_kind IN ('builtin', 'procedural'))
	),
	CHECK (storage_kind = 'r2' OR import_state = 'ready'),
	CHECK (import_state <> 'ready' OR storage_kind = 'none'
		OR (mime IS NOT NULL AND byte_size IS NOT NULL AND sha256 IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS assets_project_created_at_idx
	ON assets (project_id, created_at DESC, id ASC);
