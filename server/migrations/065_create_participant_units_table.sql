CREATE TABLE IF NOT EXISTS participant_units (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  unit_name text NOT NULL,
  unit_type text NOT NULL,
  contact_name text,
  contact_role text,
  contact_phone text,
  contact_email text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participant_units_project_id
  ON participant_units (project_id);

CREATE INDEX IF NOT EXISTS idx_participant_units_unit_name
  ON participant_units (unit_name);

CREATE INDEX IF NOT EXISTS idx_participant_units_unit_type
  ON participant_units (unit_type);
