CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL CHECK (collection IN (
    'spincline_design_build',
    'spincline_finished_products',
    'spincline_in_action',
    'photography'
  )),
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  r2_base TEXT NOT NULL CHECK (r2_base IN ('SPINCLINE', 'PHOTO')),
  r2_key TEXT NOT NULL UNIQUE,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  width INTEGER,
  height INTEGER,
  aspect_ratio REAL,
  poster_r2_key TEXT,
  is_public INTEGER DEFAULT 1,
  sort_index INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_items_collection_public_order
  ON media_items(collection, is_public, sort_index DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS multipart_uploads (
  key TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  r2_base TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('video')),
  original_filename TEXT,
  content_type TEXT,
  part_size INTEGER NOT NULL DEFAULT 33554432,
  status TEXT NOT NULL CHECK (status IN ('initiated', 'completed', 'aborted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
