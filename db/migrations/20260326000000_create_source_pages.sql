-- migrate:up

CREATE TABLE IF NOT EXISTS source_pages (
    id TEXT PRIMARY KEY,
    agency_id TEXT,
    agency_name TEXT,
    top_agency_name TEXT,
    sub_agency_name TEXT,
    page_code TEXT UNIQUE,
    page_name TEXT,
    source_url TEXT,
    submitted_source_url TEXT,
    extractor_name TEXT,
    page_behavior_json TEXT,
    matrix_header_keywords TEXT,
    force_matrix BOOLEAN,
    is_active BOOLEAN,
    created_at TEXT,
    updated_at TEXT
);

-- migrate:down

DROP TABLE IF EXISTS source_pages;
