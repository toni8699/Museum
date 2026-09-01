CREATE TABLE IF NOT EXISTS users (
	id text PRIMARY KEY,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
	id text PRIMARY KEY,
	owner_id text NOT NULL REFERENCES users(id),
	name text NOT NULL,
	latest_version integer NOT NULL DEFAULT 0 CHECK (latest_version >= 0),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_versions (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	project_id text NOT NULL REFERENCES projects(id),
	version integer NOT NULL CHECK (version > 0),
	document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS projects_owner_updated_at_idx
	ON projects (owner_id, updated_at DESC);
