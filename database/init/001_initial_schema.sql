CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iso_alpha2 VARCHAR(2) UNIQUE NOT NULL,
    iso_alpha3 VARCHAR(3) UNIQUE NOT NULL,
    name VARCHAR(120) UNIQUE NOT NULL,
    center_latitude DOUBLE PRECISION NOT NULL,
    center_longitude DOUBLE PRECISION NOT NULL,
    default_zoom SMALLINT NOT NULL,
    min_latitude DOUBLE PRECISION,
    max_latitude DOUBLE PRECISION,
    min_longitude DOUBLE PRECISION,
    max_longitude DOUBLE PRECISION,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT place_statuses_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT countries_iso_alpha2_uppercase CHECK (iso_alpha2 = upper(iso_alpha2)),
    CONSTRAINT countries_iso_alpha3_uppercase CHECK (iso_alpha3 = upper(iso_alpha3)),
    CONSTRAINT countries_center_latitude_range CHECK (center_latitude BETWEEN -90 AND 90),
    CONSTRAINT countries_center_longitude_range CHECK (center_longitude BETWEEN -180 AND 180),
    CONSTRAINT countries_default_zoom_range CHECK (default_zoom BETWEEN 1 AND 18),
    CONSTRAINT countries_bounds_consistency CHECK (
        (min_latitude IS NULL AND max_latitude IS NULL AND min_longitude IS NULL AND max_longitude IS NULL)
        OR (min_latitude IS NOT NULL AND max_latitude IS NOT NULL
            AND min_longitude IS NOT NULL AND max_longitude IS NOT NULL
            AND min_latitude BETWEEN -90 AND 90 AND max_latitude BETWEEN -90 AND 90
            AND min_longitude BETWEEN -180 AND 180 AND max_longitude BETWEEN -180 AND 180
            AND min_latitude < max_latitude AND min_longitude < max_longitude)
    )
);

CREATE TABLE poi_maps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
    center_latitude DOUBLE PRECISION,
    center_longitude DOUBLE PRECISION,
    default_zoom SMALLINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT poi_maps_country_id_key UNIQUE (country_id),
    CONSTRAINT poi_maps_center_consistency CHECK (
        (center_latitude IS NULL AND center_longitude IS NULL)
        OR (center_latitude IS NOT NULL AND center_longitude IS NOT NULL
            AND center_latitude BETWEEN -90 AND 90 AND center_longitude BETWEEN -180 AND 180)
    ),
    CONSTRAINT poi_maps_default_zoom_range CHECK (default_zoom IS NULL OR default_zoom BETWEEN 1 AND 18)
);

CREATE TABLE place_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(7) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT place_statuses_sort_order_nonnegative CHECK (sort_order >= 0),
    CONSTRAINT place_statuses_color_format CHECK (color ~ '^#[0-9A-F]{6}$')
);

CREATE UNIQUE INDEX place_statuses_one_default_idx
ON place_statuses(is_default)
WHERE is_default;

INSERT INTO place_statuses (id, name, slug, color, sort_order, is_default)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'À faire', 'a-faire', '#2563EB', 10, TRUE),
    ('10000000-0000-4000-8000-000000000002', 'Fait', 'fait', '#16A34A', 20, FALSE),
    ('10000000-0000-4000-8000-000000000003', 'À vérifier', 'a-verifier', '#D97706', 30, FALSE),
    ('10000000-0000-4000-8000-000000000004', 'À revisiter', 'a-revisiter', '#7C3AED', 40, FALSE),
    ('10000000-0000-4000-8000-000000000005', 'Inaccessible', 'inaccessible', '#DC2626', 50, FALSE);

CREATE TABLE places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location GEOMETRY(Point,4326),
    map_id UUID NOT NULL REFERENCES poi_maps(id) ON DELETE RESTRICT,
    status_id UUID NOT NULL REFERENCES place_statuses(id) ON DELETE RESTRICT,
    region VARCHAR(100),
    construction_date VARCHAR(100),
    abandonment_date VARCHAR(100),
    condition VARCHAR(50),
    access VARCHAR(50),
    danger_level VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE place_categories (
    place_id UUID REFERENCES places(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY(place_id, category_id)
);

CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID REFERENCES places(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT,
    path TEXT,
    description TEXT,
    taken_at DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT photos_sort_order_nonnegative CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX photos_place_sort_order_key ON photos(place_id, sort_order);
CREATE UNIQUE INDEX photos_one_primary_per_place_idx ON photos(place_id) WHERE is_primary;

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE place_tags (
    place_id UUID REFERENCES places(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY(place_id, tag_id)
);

CREATE INDEX places_location_idx
ON places
USING GIST(location);

CREATE INDEX places_map_id_idx
ON places(map_id);

CREATE INDEX places_status_id_idx
ON places(status_id);
