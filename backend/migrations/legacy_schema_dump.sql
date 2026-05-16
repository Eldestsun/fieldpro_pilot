--
-- PostgreSQL database dump
--

\restrict ZIkNjchdOKO9Qz1J3ccQAEMgEAuMyjfSw0LfTMS9mD4Wp0RqaOOWhLRgL3qkgCR

-- Dumped from database version 14.18 (Debian 14.18-1.pgdg120+1)
-- Dumped by pg_dump version 14.20 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: enforce_location_external_ids_org_match(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.enforce_location_external_ids_org_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare loc_org bigint;
begin
  select org_id into loc_org
  from core.locations
  where id = new.location_id;

  if loc_org is null then
    raise exception 'Invalid location_id %', new.location_id;
  end if;

  if new.org_id <> loc_org then
    raise exception 'Org mismatch: location_external_ids.org_id % must match locations.org_id %',
      new.org_id, loc_org;
  end if;

  return new;
end;
$$;


--
-- Name: enforce_route_runs_pool_invariant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_route_runs_pool_invariant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  p_org_id bigint;
  p_base_id text;
BEGIN
  -- If no pool, nothing to enforce
  IF NEW.route_pool_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lookup the pool we reference
  SELECT rp.org_id, rp.base_id
    INTO p_org_id, p_base_id
  FROM public.route_pools rp
  WHERE rp.id = NEW.route_pool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'route_pool_id % not found', NEW.route_pool_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- org_id: autofill if null; otherwise enforce match
  IF NEW.org_id IS NULL THEN
    NEW.org_id := p_org_id;
  ELSIF NEW.org_id <> p_org_id THEN
    RAISE EXCEPTION
      'route_runs.org_id % does not match route_pools.org_id % (pool=%)',
      NEW.org_id, p_org_id, NEW.route_pool_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- base_id: autofill if null; otherwise enforce match
  IF NEW.base_id IS NULL THEN
    NEW.base_id := p_base_id;
  ELSIF NEW.base_id <> p_base_id THEN
    RAISE EXCEPTION
      'route_runs.base_id % does not match route_pools.base_id % (pool=%)',
      NEW.base_id, p_base_id, NEW.route_pool_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: prevent_route_pool_org_base_change_if_used(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_route_pool_org_base_change_if_used() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (NEW.org_id IS DISTINCT FROM OLD.org_id) OR (NEW.base_id IS DISTINCT FROM OLD.base_id) THEN
    IF EXISTS (
      SELECT 1
      FROM public.route_runs rr
      WHERE rr.route_pool_id = OLD.id
      LIMIT 1
    ) THEN
      RAISE EXCEPTION
        'Cannot change org_id/base_id for route_pool % because route_runs exist',
        OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: stops_readonly(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stops_readonly() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'public.stops is read-only. Write to public.transit_stops instead.';
end;
$$;


--
-- Name: sync_transit_stop_primary_asset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_transit_stop_primary_asset() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- If asset_id is null, optionally deactivate any existing active primary
  IF NEW.asset_id IS NULL THEN
    UPDATE public.transit_stop_assets
    SET active = false, updated_at = now()
    WHERE stop_id = NEW.stop_id AND role = 'primary' AND active = true;
    RETURN NEW;
  END IF;

  -- Deactivate any other active primary for this stop
  UPDATE public.transit_stop_assets
  SET active = false, updated_at = now()
  WHERE stop_id = NEW.stop_id
    AND role = 'primary'
    AND active = true
    AND asset_id <> NEW.asset_id;

  -- Ensure the desired primary is active (matches your partial unique index)
  INSERT INTO public.transit_stop_assets (stop_id, asset_id, role, active)
  VALUES (NEW.stop_id, NEW.asset_id, 'primary', true)
  ON CONFLICT (stop_id, asset_id, role) WHERE active = true
  DO UPDATE SET active = true, updated_at = now();

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: asset_locations; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.asset_locations (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    asset_id bigint NOT NULL,
    location_id bigint NOT NULL,
    role text DEFAULT 'primary'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    installed_at timestamp with time zone,
    removed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.asset_locations FORCE ROW LEVEL SECURITY;


--
-- Name: asset_locations_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

CREATE SEQUENCE core.asset_locations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asset_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: -
--

ALTER SEQUENCE core.asset_locations_id_seq OWNED BY core.asset_locations.id;


--
-- Name: asset_types; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.asset_types (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    type_key text NOT NULL,
    display_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.asset_types FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE asset_types; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON TABLE core.asset_types IS 'Per-tenant asset type registry. Defines what kinds of assets exist for this organization — transit_stop is one type among many. type_key is free text per tenant; no platform-wide enum. Distinct from public.asset_types, which is a global code table without org scoping. core.observation_type_registry is keyed here.';


--
-- Name: COLUMN asset_types.org_id; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.asset_types.org_id IS 'Tenant isolation — every asset type belongs to exactly one org. RLS enforces this at the DB layer.';


--
-- Name: COLUMN asset_types.type_key; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.asset_types.type_key IS 'Tenant-local identifier string. Examples: transit_stop, restroom, trailhead, shelter, housing_unit. Must be unique within the org. The seeder (Change 2) inserts ''transit_stop'' for KCM.';


--
-- Name: COLUMN asset_types.description; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.asset_types.description IS 'Optional human-readable description for the admin config UI.';


--
-- Name: asset_types_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.asset_types ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.asset_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: assignments; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.assignments (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    assignment_type text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    location_id bigint,
    primary_asset_id bigint,
    planned_for_date date,
    planned_start_at timestamp with time zone,
    planned_end_at timestamp with time zone,
    created_by_oid text NOT NULL,
    source_system text,
    source_ref text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.assignments FORCE ROW LEVEL SECURITY;


--
-- Name: assignments_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

CREATE SEQUENCE core.assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: -
--

ALTER SEQUENCE core.assignments_id_seq OWNED BY core.assignments.id;


--
-- Name: evidence; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.evidence (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    observation_id bigint,
    kind text NOT NULL,
    storage_key text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    captured_by_oid text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.evidence FORCE ROW LEVEL SECURITY;


--
-- Name: evidence_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

CREATE SEQUENCE core.evidence_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evidence_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: -
--

ALTER SEQUENCE core.evidence_id_seq OWNED BY core.evidence.id;


--
-- Name: location_external_ids; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.location_external_ids (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    location_id bigint NOT NULL,
    source_system text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.location_external_ids FORCE ROW LEVEL SECURITY;


--
-- Name: location_external_ids_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

CREATE SEQUENCE core.location_external_ids_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: location_external_ids_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: -
--

ALTER SEQUENCE core.location_external_ids_id_seq OWNED BY core.location_external_ids.id;


--
-- Name: locations; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.locations (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    location_type text NOT NULL,
    label text,
    lon double precision,
    lat double precision,
    address text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.locations FORCE ROW LEVEL SECURITY;


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

CREATE SEQUENCE core.locations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: -
--

ALTER SEQUENCE core.locations_id_seq OWNED BY core.locations.id;


--
-- Name: observation_type_registry; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.observation_type_registry (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    asset_type_id bigint NOT NULL,
    observation_key text NOT NULL,
    display_name text NOT NULL,
    value_type text NOT NULL,
    valid_values jsonb,
    is_required boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT observation_type_registry_value_type_check CHECK ((value_type = ANY (ARRAY['state'::text, 'numeric'::text, 'boolean'::text])))
);

ALTER TABLE ONLY core.observation_type_registry FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE observation_type_registry; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON TABLE core.observation_type_registry IS 'Per-tenant, per-asset-type observation type configuration. Replaces hardcoded observation type constants in observationService.ts. Each org configures what observations are valid for each asset type. No transit-specific assumptions — fully configurable per tenant. Change 3 will query this table via getArrivalObservationTypes() instead of the hardcoded ARRIVAL_OBSERVATION_TYPES constant.';


--
-- Name: COLUMN observation_type_registry.observation_key; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.observation_type_registry.observation_key IS 'Tenant-local identifier string for this observation type. KCM transit_stop examples: ground_condition, shelter_condition, pad_condition, washed_can, trash_volume, hazard_present, infra_condition.';


--
-- Name: COLUMN observation_type_registry.value_type; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.observation_type_registry.value_type IS 'Controls the shape of valid_values and how observations are validated: state   — valid_values is a JSON string array of allowed values; numeric — valid_values is a {"min": n, "max": n} range object; boolean — valid_values is unused (null).';


--
-- Name: COLUMN observation_type_registry.valid_values; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.observation_type_registry.valid_values IS 'Depends on value_type. State example:   ["clean", "dirty", "needs_attention"]. Numeric example: {"min": 0, "max": 100}. Boolean:         null.';


--
-- Name: COLUMN observation_type_registry.is_required; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.observation_type_registry.is_required IS 'When true, this observation must be captured on every visit to an asset of this type. Used by getArrivalObservationTypes() in Change 3 to replace the hardcoded required-type list.';


--
-- Name: COLUMN observation_type_registry.sort_order; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.observation_type_registry.sort_order IS 'Display and validation ordering within a given asset type. Lower numbers appear first in the field UI.';


--
-- Name: observation_type_registry_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.observation_type_registry ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.observation_type_registry_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: observations; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.observations (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    location_id bigint,
    asset_id bigint,
    observation_type text NOT NULL,
    severity text,
    status text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by_oid text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.observations FORCE ROW LEVEL SECURITY;


--
-- Name: observations_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

CREATE SEQUENCE core.observations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: observations_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: -
--

ALTER SEQUENCE core.observations_id_seq OWNED BY core.observations.id;


--
-- Name: v_locations_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_locations_transit AS
 SELECT l.id AS location_id,
    l.org_id,
    l.location_type,
    l.label,
    l.lon,
    l.lat,
    lei.source_system,
    lei.external_id AS stop_id
   FROM (core.locations l
     JOIN core.location_external_ids lei ON ((lei.location_id = l.id)))
  WHERE ((l.location_type = 'transit_stop'::text) AND (lei.source_system = 'metro_stop'::text));


--
-- Name: v_asset_locations_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_asset_locations_transit AS
 SELECT al.id AS asset_location_id,
    al.org_id,
    al.location_id,
    vt.stop_id,
    al.asset_id,
    al.role,
    al.active,
    al.installed_at,
    al.removed_at,
    al.notes
   FROM (core.asset_locations al
     JOIN core.v_locations_transit vt ON ((vt.location_id = al.location_id)));


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    asset_type_id bigint NOT NULL,
    seed_key text NOT NULL,
    lon double precision,
    lat double precision,
    display_name text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    external_id text
);


--
-- Name: TABLE assets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assets IS 'Canonical asset table. A visit belongs to an asset; an asset has a type; asset types are configured per tenant in core.asset_types. transit_stops is one seeding source — parks, facilities, and housing portfolios seed this table from their own inventories. Any field ops vertical plugs in here without schema changes. Coordinate columns:  lat / lon (double precision). Active flag:         active (boolean). Legacy identity key: seed_key. Canonical identity:  external_id (added Tier 8).';


--
-- Name: COLUMN assets.seed_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.seed_key IS 'Pre-Tier-8 identity key — the external system ID used during initial seeding. Superseded by external_id (Tier 8). Retained to avoid breaking existing seeding paths.';


--
-- Name: COLUMN assets.attributes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.attributes IS 'Asset-type-specific metadata. Schema is defined per asset type; no platform-wide shape is imposed. transit_stop example: {"is_hotspot": true, "compactor": false, "has_trash": true, "pool_id": "p1"}. restroom example: {"stall_count": 4, "ada_compliant": true}.';


--
-- Name: COLUMN assets.external_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.external_id IS 'Canonical external identity key — the ID this asset carries in its source system (stop_id, unit_id, trail_id, parcel_id, etc.). seed_key is the predecessor column with the same semantic meaning; both coexist during the Tier 8 transition. Change 2 (seed_transit_assets.ts) will backfill this from seed_key for all existing KCM transit stop rows.';


--
-- Name: v_assets; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_assets AS
 SELECT a.id,
    a.org_id,
    a.asset_type_id,
    a.seed_key,
    a.lon,
    a.lat,
    a.display_name,
    a.active,
    a.created_at,
    a.updated_at
   FROM public.assets a;


--
-- Name: route_run_stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_run_stops (
    id bigint NOT NULL,
    route_run_id bigint NOT NULL,
    stop_id text NOT NULL,
    sequence integer NOT NULL,
    planned_distance_m double precision,
    planned_duration_s double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    trash_volume smallint,
    hazard_id bigint,
    infra_issue_id bigint,
    origin_type text DEFAULT 'planned'::text,
    asset_id bigint NOT NULL,
    started_at timestamp with time zone,
    CONSTRAINT route_run_stops_origin_type_chk CHECK ((origin_type = ANY (ARRAY['planned'::text, 'emergency'::text, 'ul_ad_hoc'::text]))),
    CONSTRAINT route_run_stops_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text, 'skipped'::text])))
);


--
-- Name: COLUMN route_run_stops.trash_volume; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.route_run_stops.trash_volume IS 'Trash volume at time this stop was completed during the route run.';


--
-- Name: route_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_runs (
    id bigint NOT NULL,
    user_id bigint,
    route_pool_id text,
    base_id text,
    run_date date NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    total_distance_m double precision,
    total_duration_s double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    org_id bigint NOT NULL,
    assigned_user_oid text,
    created_by_oid text
);


--
-- Name: v_assignments_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_assignments_transit AS
 SELECT rrs.id AS source_route_run_stop_id,
    rr.org_id,
    'route_stop'::text AS assignment_type,
    rrs.status,
    vt.location_id,
    rrs.asset_id AS primary_asset_id,
    rr.id AS source_route_run_id,
    rrs.sequence,
    rrs.created_at
   FROM ((public.route_run_stops rrs
     JOIN public.route_runs rr ON ((rr.id = rrs.route_run_id)))
     LEFT JOIN core.v_locations_transit vt ON ((vt.stop_id = rrs.stop_id)));


--
-- Name: v_stop_location_map; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_stop_location_map AS
 SELECT lei.org_id,
    lei.external_id AS stop_id,
    lei.location_id
   FROM core.location_external_ids lei
  WHERE (lei.source_system = 'metro_stop'::text);


--
-- Name: clean_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clean_logs (
    id bigint NOT NULL,
    route_run_stop_id bigint,
    stop_id text NOT NULL,
    user_id bigint,
    cleaned_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_minutes integer,
    picked_up_litter boolean DEFAULT false,
    emptied_trash boolean DEFAULT false,
    washed_shelter boolean DEFAULT false,
    washed_pad boolean DEFAULT false,
    washed_can boolean DEFAULT false,
    level smallint,
    notes text,
    photo_keys text[],
    asset_id bigint,
    visit_id bigint
);


--
-- Name: v_clean_logs_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_clean_logs_transit AS
 SELECT cl.id,
    cl.route_run_stop_id,
    cl.stop_id,
    cl.user_id,
    cl.cleaned_at,
    cl.duration_minutes,
    cl.picked_up_litter,
    cl.emptied_trash,
    cl.washed_shelter,
    cl.washed_pad,
    cl.washed_can,
    cl.level,
    cl.notes,
    cl.photo_keys,
    cl.asset_id,
    slm.location_id,
    COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
   FROM ((((public.clean_logs cl
     LEFT JOIN public.assets a ON ((a.id = cl.asset_id)))
     LEFT JOIN public.route_run_stops rrs ON ((rrs.id = cl.route_run_stop_id)))
     LEFT JOIN public.route_runs rr ON ((rr.id = rrs.route_run_id)))
     LEFT JOIN core.v_stop_location_map slm ON ((slm.stop_id = cl.stop_id)));


--
-- Name: hazards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hazards (
    id bigint NOT NULL,
    stop_id text NOT NULL,
    route_run_stop_id bigint,
    reported_at timestamp with time zone DEFAULT now() NOT NULL,
    reported_by bigint,
    hazard_type text,
    severity smallint,
    notes text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    photo_key text,
    asset_id bigint,
    visit_id bigint
);


--
-- Name: v_hazards_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_hazards_transit AS
 SELECT h.id,
    h.stop_id,
    h.route_run_stop_id,
    h.reported_at,
    h.reported_by,
    h.hazard_type,
    h.severity,
    h.notes,
    h.details,
    h.photo_key,
    h.asset_id,
    slm.location_id,
    COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
   FROM ((((public.hazards h
     LEFT JOIN public.assets a ON ((a.id = h.asset_id)))
     LEFT JOIN public.route_run_stops rrs ON ((rrs.id = h.route_run_stop_id)))
     LEFT JOIN public.route_runs rr ON ((rr.id = rrs.route_run_id)))
     LEFT JOIN core.v_stop_location_map slm ON ((slm.stop_id = h.stop_id)));


--
-- Name: infrastructure_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infrastructure_issues (
    id bigint NOT NULL,
    stop_id text NOT NULL,
    route_run_stop_id bigint,
    reported_at timestamp with time zone DEFAULT now() NOT NULL,
    reported_by bigint,
    issue_type text NOT NULL,
    severity smallint,
    notes text,
    component text,
    cause text,
    needs_facilities boolean DEFAULT true NOT NULL,
    details jsonb,
    photo_keys text[],
    photo_key text,
    asset_id bigint,
    visit_id bigint
);


--
-- Name: v_infra_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_infra_transit AS
 SELECT i.id,
    i.stop_id,
    i.route_run_stop_id,
    i.reported_at,
    i.reported_by,
    i.issue_type,
    i.severity,
    i.notes,
    i.component,
    i.cause,
    i.needs_facilities,
    i.details,
    i.photo_keys,
    i.photo_key,
    i.asset_id,
    slm.location_id,
    COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
   FROM ((((public.infrastructure_issues i
     LEFT JOIN public.assets a ON ((a.id = i.asset_id)))
     LEFT JOIN public.route_run_stops rrs ON ((rrs.id = i.route_run_stop_id)))
     LEFT JOIN public.route_runs rr ON ((rr.id = rrs.route_run_id)))
     LEFT JOIN core.v_stop_location_map slm ON ((slm.stop_id = i.stop_id)));


--
-- Name: level3_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.level3_logs (
    id bigint NOT NULL,
    route_run_stop_id bigint,
    stop_id text NOT NULL,
    cleaned_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id bigint,
    level smallint NOT NULL,
    notes text,
    asset_id bigint,
    visit_id bigint
);


--
-- Name: v_level3_logs_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_level3_logs_transit AS
 SELECT l3.id,
    l3.route_run_stop_id,
    l3.stop_id,
    l3.cleaned_at,
    l3.user_id,
    l3.level,
    l3.notes,
    l3.asset_id,
    slm.location_id,
    COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
   FROM ((((public.level3_logs l3
     LEFT JOIN public.assets a ON ((a.id = l3.asset_id)))
     LEFT JOIN public.route_run_stops rrs ON ((rrs.id = l3.route_run_stop_id)))
     LEFT JOIN public.route_runs rr ON ((rr.id = rrs.route_run_id)))
     LEFT JOIN core.v_stop_location_map slm ON ((slm.stop_id = l3.stop_id)));


--
-- Name: v_locations; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_locations AS
 SELECT l.id,
    l.org_id,
    l.location_type,
    l.label,
    l.lon,
    l.lat,
    l.address,
    l.active,
    l.created_at,
    l.updated_at
   FROM core.locations l;


--
-- Name: stop_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stop_photos (
    id bigint NOT NULL,
    route_run_stop_id bigint NOT NULL,
    s3_key text NOT NULL,
    kind text DEFAULT 'generic'::text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_oid text NOT NULL,
    asset_id bigint,
    visit_id bigint
);


--
-- Name: v_stop_photos_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_stop_photos_transit AS
 SELECT sp.id,
    sp.route_run_stop_id,
    sp.s3_key,
    sp.kind,
    sp.captured_at,
    sp.created_by_oid,
    sp.asset_id,
    slm.location_id,
    COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved,
    rrs.stop_id
   FROM ((((public.stop_photos sp
     LEFT JOIN public.assets a ON ((a.id = sp.asset_id)))
     LEFT JOIN public.route_run_stops rrs ON ((rrs.id = sp.route_run_stop_id)))
     LEFT JOIN public.route_runs rr ON ((rr.id = rrs.route_run_id)))
     LEFT JOIN core.v_stop_location_map slm ON ((slm.stop_id = rrs.stop_id)));


--
-- Name: trash_volume_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trash_volume_logs (
    id bigint NOT NULL,
    route_run_stop_id bigint,
    stop_id text NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    volume smallint NOT NULL,
    notes text,
    asset_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    visit_id bigint
);


--
-- Name: TABLE trash_volume_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trash_volume_logs IS 'Historical trash volume readings per stop visit; feeds cleanliness risk scoring.';


--
-- Name: COLUMN trash_volume_logs.volume; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trash_volume_logs.volume IS 'Discrete trash volume level (0–4 scale) at time of service.';


--
-- Name: v_trash_volume_logs_transit; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.v_trash_volume_logs_transit AS
 SELECT tvl.id,
    tvl.route_run_stop_id,
    tvl.stop_id,
    tvl.logged_at,
    tvl.volume,
    tvl.notes,
    tvl.asset_id,
    tvl.created_at,
    tvl.updated_at,
    slm.location_id,
    COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
   FROM ((((public.trash_volume_logs tvl
     LEFT JOIN public.assets a ON ((a.id = tvl.asset_id)))
     LEFT JOIN public.route_run_stops rrs ON ((rrs.id = tvl.route_run_stop_id)))
     LEFT JOIN public.route_runs rr ON ((rr.id = rrs.route_run_id)))
     LEFT JOIN core.v_stop_location_map slm ON ((slm.stop_id = tvl.stop_id)));


--
-- Name: visits; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.visits (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    location_id bigint,
    primary_asset_id bigint,
    assignment_id bigint,
    actor_oid text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    visit_type text NOT NULL,
    outcome text,
    reason_code text,
    notes text,
    client_visit_id uuid,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    captured_by_oid_ciphertext bytea,
    captured_by_oid_key_id text
);

ALTER TABLE ONLY core.visits FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN visits.captured_by_oid_ciphertext; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.visits.captured_by_oid_ciphertext IS 'AES-256-GCM envelope-encrypted actor OID. Blob layout: version(1) | wrapped_dek_len(2) | wrapped_dek(N) | data_iv(12) | data_tag(16) | data_ciphertext(var). See backend/src/lib/oidCipher.ts for full spec.';


--
-- Name: COLUMN visits.captured_by_oid_key_id; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.visits.captured_by_oid_key_id IS 'KMS key version used to wrap the DEK in captured_by_oid_ciphertext. Dev: dev-static-v1. Prod: Azure Key Vault key version string.';


--
-- Name: visits_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

CREATE SEQUENCE core.visits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visits_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: -
--

ALTER SEQUENCE core.visits_id_seq OWNED BY core.visits.id;


--
-- Name: asset_external_ids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_external_ids (
    id bigint NOT NULL,
    asset_id bigint NOT NULL,
    external_system text NOT NULL,
    external_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_external_ids_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.asset_external_ids ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.asset_external_ids_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: asset_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_types (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.asset_types ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.asset_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.assets ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.assets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    actor_oid text NOT NULL,
    org_id uuid NOT NULL,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    detail jsonb,
    ip_address text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_log IS 'Append-only compliance audit trail. Stores Azure Entra OIDs (actor_oid) only — never worker names, display names, or role-inferrable identifiers. Admin-tier access only (enforced at the route layer in S1-3). UPDATE and DELETE are blocked by RLS policy (FORCE ROW LEVEL SECURITY).';


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: bases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bases (
    id text NOT NULL,
    name text NOT NULL,
    lon double precision NOT NULL,
    lat double precision NOT NULL,
    address text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id bigint NOT NULL
);


--
-- Name: clean_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clean_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clean_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clean_logs_id_seq OWNED BY public.clean_logs.id;


--
-- Name: stop_risk_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stop_risk_snapshot (
    stop_id text NOT NULL,
    is_hotspot boolean DEFAULT false NOT NULL,
    days_since_last_l3 integer,
    recent_trash_volume_avg numeric(4,2),
    last_hazard_at timestamp without time zone,
    last_hazard_severity integer,
    infra_issue_score numeric(4,2),
    cleanliness_score numeric(4,2),
    safety_score numeric(4,2),
    infrastructure_score numeric(4,2),
    combined_risk_score numeric(6,3),
    computed_at timestamp without time zone DEFAULT now() NOT NULL,
    hotspot_weight numeric(4,2) DEFAULT 0 NOT NULL,
    l3_urgency_weight numeric(4,2) DEFAULT 0 NOT NULL,
    has_recent_hazard boolean DEFAULT false NOT NULL,
    hazard_days_ago integer,
    hazard_decay_factor numeric(4,2) DEFAULT 0 NOT NULL,
    asset_id bigint
);


--
-- Name: stops_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stops_legacy (
    "STOP_ID" text NOT NULL,
    "TRF_DISTRICT_CODE" text,
    "BAY_CODE" text,
    "BEARING_CODE" text,
    "ON_STREET_NAME" text,
    "INTERSECTION_LOC" text,
    "HASTUS_CROSS_STREET_NAME" text,
    "KCM_MANAGED_EQUIPMENT" text,
    "ROUTE_LIST" text,
    "NUM_SHELTERS" integer,
    "STOP_STATUS" text,
    "GISOBJID" text,
    lon double precision,
    lat double precision,
    is_hotspot boolean DEFAULT false,
    compactor boolean DEFAULT false,
    has_trash boolean DEFAULT false,
    notes text,
    pool_id text,
    last_level3_at timestamp with time zone,
    priority_class text DEFAULT 'medium'::text,
    asset_id bigint,
    CONSTRAINT stops_hotspot_priority_consistency_chk CHECK ((NOT ((COALESCE(is_hotspot, false) = true) AND (priority_class = 'light'::text)))),
    CONSTRAINT stops_priority_class_chk CHECK ((priority_class = ANY (ARRAY['light'::text, 'medium'::text, 'hotspot'::text])))
);


--
-- Name: cleanliness_risk_mv; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.cleanliness_risk_mv AS
 SELECT s."STOP_ID" AS stop_id,
    s.pool_id,
    s.is_hotspot,
    s.priority_class,
    s.has_trash,
    s.compactor AS has_compactor,
    s.last_level3_at,
    r.days_since_last_l3,
        CASE
            WHEN (r.days_since_last_l3 <= 7) THEN '0-7'::text
            WHEN (r.days_since_last_l3 <= 14) THEN '8-14'::text
            WHEN (r.days_since_last_l3 <= 30) THEN '15-30'::text
            ELSE '30+'::text
        END AS l3_aging_bucket,
    (r.days_since_last_l3 > 30) AS is_overdue_30d,
    r.recent_trash_volume_avg,
    r.cleanliness_score,
    r.hotspot_weight,
    r.l3_urgency_weight,
    r.combined_risk_score,
    now() AS as_of,
    r.computed_at
   FROM (public.stop_risk_snapshot r
     JOIN public.stops_legacy s ON ((s."STOP_ID" = r.stop_id)))
  WITH NO DATA;


--
-- Name: eam_bridge_populate_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eam_bridge_populate_state (
    id integer DEFAULT 1 NOT NULL,
    watermark timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL,
    CONSTRAINT eam_bridge_populate_state_id_check CHECK ((id = 1))
);


--
-- Name: eam_bridge_route_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eam_bridge_route_log (
    id bigint NOT NULL,
    org_id bigint NOT NULL,
    route_run_id bigint NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    stop_count integer DEFAULT 0 NOT NULL,
    exception_count integer DEFAULT 0 NOT NULL,
    canonical_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE eam_bridge_route_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.eam_bridge_route_log IS 'EAMS-facing contract surface. One row per completed route run. Contains NO worker identity — no actor_oid, no captured_by_oid, no user_id. Read-only from EAMS; written by BASELINE populate script (populateEamBridge.ts). Schema changes require coordination with KCM IT / EAMS team.';


--
-- Name: eam_bridge_route_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eam_bridge_route_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eam_bridge_route_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eam_bridge_route_log_id_seq OWNED BY public.eam_bridge_route_log.id;


--
-- Name: export_delete_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_delete_tokens (
    id bigint NOT NULL,
    token_hash text NOT NULL,
    org_id text NOT NULL,
    actor_oid text NOT NULL,
    export_path text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone
);


--
-- Name: TABLE export_delete_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.export_delete_tokens IS 'Confirmation tokens for the two-step export-and-delete flow. token_hash is sha256 of the raw token — raw token is returned once and never stored. consumed_at marks irreversible deletion. WARNING: hard delete via /execute is permanent and cannot be undone.';


--
-- Name: export_delete_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_delete_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_delete_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_delete_tokens_id_seq OWNED BY public.export_delete_tokens.id;


--
-- Name: stop_status_mv; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.stop_status_mv AS
 WITH risk AS (
         SELECT r.stop_id,
            r.days_since_last_l3,
            r.recent_trash_volume_avg,
            r.cleanliness_score,
            r.safety_score,
            r.infrastructure_score,
            r.hotspot_weight,
            r.l3_urgency_weight,
            r.combined_risk_score,
            r.computed_at
           FROM public.stop_risk_snapshot r
        ), haz_30d AS (
         SELECT h.stop_id,
            count(*) FILTER (WHERE (h.reported_at >= (now() - '30 days'::interval))) AS hazards_30d,
            count(*) FILTER (WHERE ((h.reported_at >= (now() - '30 days'::interval)) AND (COALESCE(h.hazard_type, ''::text) ~~* '%needle%'::text))) AS needles_30d,
            max(h.reported_at) AS last_hazard_at
           FROM public.hazards h
          GROUP BY h.stop_id
        ), infra_30d AS (
         SELECT i.stop_id,
            count(*) FILTER (WHERE (i.reported_at >= (now() - '30 days'::interval))) AS infra_30d,
            max(i.reported_at) AS last_infra_at,
            ( SELECT i2.issue_type
                   FROM public.infrastructure_issues i2
                  WHERE (i2.stop_id = i.stop_id)
                  ORDER BY i2.reported_at DESC NULLS LAST
                 LIMIT 1) AS most_recent_infra_type
           FROM public.infrastructure_issues i
          GROUP BY i.stop_id
        ), clean_visits AS (
         SELECT c.stop_id,
            count(*) FILTER (WHERE (c.cleaned_at >= (now() - '30 days'::interval))) AS visits_30d,
            max(c.cleaned_at) AS last_visit_at,
            max(c.cleaned_at) FILTER (WHERE (c.washed_pad IS TRUE)) AS last_pad_scrub_at,
            max(c.cleaned_at) FILTER (WHERE (c.level = 3)) AS last_l3_from_clean_at
           FROM public.clean_logs c
          GROUP BY c.stop_id
        ), l3_events AS (
         SELECT l.stop_id,
            max(l.cleaned_at) FILTER (WHERE (l.level = 3)) AS last_l3_from_l3log_at
           FROM public.level3_logs l
          GROUP BY l.stop_id
        ), l3_unified AS (
         SELECT COALESCE(cv_1.stop_id, le.stop_id) AS stop_id,
            GREATEST(cv_1.last_l3_from_clean_at, le.last_l3_from_l3log_at) AS last_l3_at
           FROM (clean_visits cv_1
             FULL JOIN l3_events le ON ((le.stop_id = cv_1.stop_id)))
        )
 SELECT s."STOP_ID" AS stop_id,
    s.pool_id,
    s.is_hotspot,
    s.priority_class,
    s.has_trash,
    s.compactor AS has_compactor,
        CASE
            WHEN (lu.last_l3_at IS NULL) THEN NULL::integer
            ELSE (date_part('day'::text, (now() - lu.last_l3_at)))::integer
        END AS days_since_last_l3,
        CASE
            WHEN (cv.last_visit_at IS NULL) THEN NULL::integer
            ELSE (date_part('day'::text, (now() - cv.last_visit_at)))::integer
        END AS days_since_last_visit,
        CASE
            WHEN (cv.last_pad_scrub_at IS NULL) THEN NULL::integer
            ELSE (date_part('day'::text, (now() - cv.last_pad_scrub_at)))::integer
        END AS days_since_last_pad_scrub,
    (COALESCE(cv.visits_30d, (0)::bigint))::integer AS visits_30d,
    (COALESCE(hz.hazards_30d, (0)::bigint))::integer AS hazards_30d,
    (COALESCE(hz.needles_30d, (0)::bigint))::integer AS needles_30d,
    (COALESCE(inf.infra_30d, (0)::bigint))::integer AS infra_30d,
        CASE
            WHEN (lu.last_l3_at IS NULL) THEN 'unknown'::text
            WHEN ((now() - lu.last_l3_at) <= '7 days'::interval) THEN '0-7'::text
            WHEN ((now() - lu.last_l3_at) <= '14 days'::interval) THEN '8-14'::text
            WHEN ((now() - lu.last_l3_at) <= '30 days'::interval) THEN '15-30'::text
            ELSE '30+'::text
        END AS l3_aging_bucket,
    risk.recent_trash_volume_avg,
    risk.cleanliness_score,
    risk.hotspot_weight,
    risk.l3_urgency_weight,
    risk.safety_score,
    risk.infrastructure_score,
    risk.combined_risk_score,
    hz.last_hazard_at,
    inf.last_infra_at,
    inf.most_recent_infra_type,
    cv.last_visit_at,
    cv.last_pad_scrub_at,
    lu.last_l3_at AS last_l3_completed_at,
    now() AS as_of,
    risk.computed_at
   FROM (((((public.stops_legacy s
     LEFT JOIN risk ON ((risk.stop_id = s."STOP_ID")))
     LEFT JOIN haz_30d hz ON ((hz.stop_id = s."STOP_ID")))
     LEFT JOIN infra_30d inf ON ((inf.stop_id = s."STOP_ID")))
     LEFT JOIN clean_visits cv ON ((cv.stop_id = s."STOP_ID")))
     LEFT JOIN l3_unified lu ON ((lu.stop_id = s."STOP_ID")))
  WITH NO DATA;


--
-- Name: export_pool_daily_summary_v1; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.export_pool_daily_summary_v1 AS
 SELECT ss.pool_id,
    (ss.as_of)::date AS as_of_date,
    (count(*))::integer AS stops_total,
    (sum(
        CASE
            WHEN (ss.days_since_last_l3 > 30) THEN 1
            ELSE 0
        END))::integer AS stops_overdue_l3_30d,
    round(avg(ss.cleanliness_score), 2) AS avg_cleanliness_score,
    round(avg(ss.hotspot_weight), 2) AS avg_hotspot_weight,
    round(avg(ss.l3_urgency_weight), 3) AS avg_l3_urgency,
    round(avg(ss.combined_risk_score), 2) AS avg_combined_risk,
    (sum(ss.hazards_30d))::integer AS hazards_30d_total,
    (sum(ss.infra_30d))::integer AS infra_30d_total
   FROM public.stop_status_mv ss
  GROUP BY ss.pool_id, ((ss.as_of)::date);


--
-- Name: export_route_run_origin_mix_v1; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.export_route_run_origin_mix_v1 AS
 SELECT rrs.route_run_id,
    (count(*))::integer AS stops_total,
    (sum(
        CASE
            WHEN (rrs.origin_type = 'planned'::text) THEN 1
            ELSE 0
        END))::integer AS planned_stops,
    (sum(
        CASE
            WHEN (rrs.origin_type = 'emergency'::text) THEN 1
            ELSE 0
        END))::integer AS emergency_stops,
    (sum(
        CASE
            WHEN (rrs.origin_type = 'ul_ad_hoc'::text) THEN 1
            ELSE 0
        END))::integer AS ul_ad_hoc_stops
   FROM public.route_run_stops rrs
  GROUP BY rrs.route_run_id;


--
-- Name: export_stop_status_v1; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.export_stop_status_v1 AS
 SELECT ss.stop_id,
    ss.pool_id,
    ss.is_hotspot,
    ss.priority_class,
    ss.days_since_last_l3,
    ss.days_since_last_visit,
    ss.days_since_last_pad_scrub,
    ss.l3_aging_bucket,
    ss.visits_30d,
    ss.hazards_30d,
    ss.needles_30d,
    ss.infra_30d,
    ss.cleanliness_score,
    ss.hotspot_weight,
    ss.l3_urgency_weight,
    ss.combined_risk_score,
    ss.last_visit_at,
    ss.last_pad_scrub_at,
    ss.last_l3_completed_at,
    ss.last_hazard_at,
    ss.last_infra_at,
    ss.most_recent_infra_type,
    ss.as_of
   FROM public.stop_status_mv ss;


--
-- Name: hazards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hazards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hazards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hazards_id_seq OWNED BY public.hazards.id;


--
-- Name: identity_directory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_directory (
    oid text NOT NULL,
    display_name text,
    email text,
    last_seen_role text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id bigint NOT NULL
);

ALTER TABLE ONLY public.identity_directory FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE identity_directory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.identity_directory IS 'Operational identity registry — maps Azure Entra OIDs to display names and roles for UI presentation and route assignment. Tenant-isolated via RLS on org_id. LABOR SAFETY: This table is the ONLY place worker identity is stored. No query in the intelligence layer (riskMapService, stop_risk_snapshot, stop_effort_history, stop_condition_history, AdminControlCenter) may JOIN to this table. The one controlled exception is loadRouteRunById in routeRunService.ts — documented there with justification. Any new JOIN to this table requires explicit review and comment.';


--
-- Name: infrastructure_issues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.infrastructure_issues_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: infrastructure_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.infrastructure_issues_id_seq OWNED BY public.infrastructure_issues.id;


--
-- Name: infrastructure_risk_mv; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.infrastructure_risk_mv AS
 SELECT s."STOP_ID" AS stop_id,
    s.pool_id,
    s.is_hotspot,
    s.priority_class,
    s.compactor AS has_compactor,
    r.infra_issue_score,
    r.infrastructure_score,
    r.combined_risk_score,
    now() AS as_of,
    r.computed_at
   FROM (public.stop_risk_snapshot r
     JOIN public.stops_legacy s ON ((s."STOP_ID" = r.stop_id)))
  WITH NO DATA;


--
-- Name: lead_route_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_route_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pool_id text NOT NULL,
    stop_id text NOT NULL,
    override_type text NOT NULL,
    value numeric,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_route_overrides_override_type_check CHECK ((override_type = ANY (ARRAY['FORCE_INCLUDE'::text, 'FORCE_EXCLUDE'::text, 'PRIORITY_BUMP'::text])))
);


--
-- Name: level3_compliance_mv; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.level3_compliance_mv AS
 SELECT s."STOP_ID" AS stop_id,
    s.pool_id,
    s.is_hotspot,
    s.priority_class,
    s.last_level3_at,
    r.days_since_last_l3,
    (r.days_since_last_l3 > 30) AS is_overdue_30d,
        CASE
            WHEN (r.days_since_last_l3 <= 7) THEN '0-7'::text
            WHEN (r.days_since_last_l3 <= 14) THEN '8-14'::text
            WHEN (r.days_since_last_l3 <= 30) THEN '15-30'::text
            ELSE '30+'::text
        END AS l3_aging_bucket,
    r.l3_urgency_weight,
    r.cleanliness_score,
    now() AS as_of,
    r.computed_at
   FROM (public.stop_risk_snapshot r
     JOIN public.stops_legacy s ON ((s."STOP_ID" = r.stop_id)))
  WITH NO DATA;


--
-- Name: level3_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.level3_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: level3_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.level3_logs_id_seq OWNED BY public.level3_logs.id;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id bigint NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uuid text
);


--
-- Name: COLUMN organizations.tenant_uuid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.tenant_uuid IS 'Azure AD Tenant UUID. Populated for multi-tenant deployments to map req.user.tid → organizations.id without a hardcoded lookup. Null in single-org pilot mode.';


--
-- Name: organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.organizations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.organizations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: route_pools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_pools (
    id text NOT NULL,
    label text NOT NULL,
    trf_district text,
    active boolean DEFAULT true,
    default_max_minutes integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    base_id text,
    org_id bigint NOT NULL
);


--
-- Name: route_run_stops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.route_run_stops_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: route_run_stops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.route_run_stops_id_seq OWNED BY public.route_run_stops.id;


--
-- Name: route_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.route_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: route_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.route_runs_id_seq OWNED BY public.route_runs.id;


--
-- Name: safety_risk_mv; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.safety_risk_mv AS
 SELECT s."STOP_ID" AS stop_id,
    s.pool_id,
    s.is_hotspot,
    s.priority_class,
    r.has_recent_hazard,
    r.hazard_days_ago,
        CASE
            WHEN (r.hazard_days_ago IS NULL) THEN NULL::text
            WHEN (r.hazard_days_ago <= 7) THEN '0-7'::text
            WHEN (r.hazard_days_ago <= 14) THEN '8-14'::text
            WHEN (r.hazard_days_ago <= 30) THEN '15-30'::text
            ELSE '30+'::text
        END AS hazard_aging_bucket,
    r.hazard_decay_factor,
    r.last_hazard_at,
    r.last_hazard_severity,
    r.safety_score,
    r.combined_risk_score,
    now() AS as_of,
    r.computed_at
   FROM (public.stop_risk_snapshot r
     JOIN public.stops_legacy s ON ((s."STOP_ID" = r.stop_id)))
  WITH NO DATA;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stop_assets_v1; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stop_assets_v1 AS
 SELECT s."STOP_ID" AS stop_id,
    s.asset_id,
    a.org_id,
    a.asset_type_id,
    a.lon,
    a.lat,
    a.display_name,
    s.pool_id,
    s.is_hotspot,
    s.priority_class,
    s.has_trash,
    s.compactor
   FROM (public.stops_legacy s
     LEFT JOIN public.assets a ON ((a.id = s.asset_id)));


--
-- Name: stop_condition_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stop_condition_history (
    id bigint NOT NULL,
    stop_id text NOT NULL,
    visit_id bigint NOT NULL,
    scored_at timestamp with time zone DEFAULT now() NOT NULL,
    cleanliness_score numeric(5,2),
    safety_score numeric(5,2),
    infra_score numeric(5,2),
    asset_id bigint
);


--
-- Name: TABLE stop_condition_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stop_condition_history IS 'Per-stop condition score history. Derived from core.observations
   via riskMapService. No workforce_score — worker-safe by structure.
   Replaces stop_scoring_history. Write paths wired in R10.';


--
-- Name: stop_condition_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stop_condition_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stop_condition_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stop_effort_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stop_effort_history (
    id bigint NOT NULL,
    stop_id text NOT NULL,
    visit_id bigint NOT NULL,
    run_date date NOT NULL,
    service_minutes integer,
    stop_type text NOT NULL,
    complexity_score numeric(4,2),
    had_hazard boolean DEFAULT false NOT NULL,
    had_infra_issue boolean DEFAULT false NOT NULL,
    trash_volume numeric(4,2),
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stop_effort_history_stop_type_check CHECK ((stop_type = ANY (ARRAY['hotspot'::text, 'compactor'::text, 'standard'::text])))
);


--
-- Name: TABLE stop_effort_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stop_effort_history IS 'Per-stop service effort history. Derived from core.visits and
   core.observations. No user_id — worker-safe by structure.
   Keyed by (stop_id, visit_id). Write paths wired in R10.';


--
-- Name: stop_effort_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stop_effort_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stop_effort_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stop_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stop_photos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stop_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stop_photos_id_seq OWNED BY public.stop_photos.id;


--
-- Name: transit_stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transit_stops (
    stop_id text NOT NULL,
    trf_district_code text,
    bay_code text,
    bearing_code text,
    on_street_name text,
    intersection_loc text,
    hastus_cross_street_name text,
    kcm_managed_equipment text,
    route_list text,
    num_shelters integer,
    stop_status text,
    gisobjid text,
    lon double precision,
    lat double precision,
    is_hotspot boolean DEFAULT false NOT NULL,
    compactor boolean DEFAULT false NOT NULL,
    has_trash boolean DEFAULT false NOT NULL,
    notes text,
    pool_id text,
    last_level3_at timestamp with time zone,
    priority_class text DEFAULT 'medium'::text,
    asset_id bigint,
    org_id bigint DEFAULT 1 NOT NULL
);


--
-- Name: stops; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stops AS
 SELECT ts.stop_id,
    ts.trf_district_code,
    ts.bay_code,
    ts.bearing_code,
    ts.on_street_name,
    ts.intersection_loc,
    ts.hastus_cross_street_name,
    ts.kcm_managed_equipment,
    ts.route_list,
    ts.num_shelters,
    ts.stop_status,
    ts.gisobjid,
    ts.lon,
    ts.lat,
    ts.is_hotspot,
    ts.compactor,
    ts.has_trash,
    ts.notes,
    ts.pool_id,
    ts.last_level3_at,
    ts.priority_class,
    ts.asset_id
   FROM public.transit_stops ts;


--
-- Name: transit_stop_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transit_stop_assets (
    id bigint NOT NULL,
    stop_id text NOT NULL,
    asset_id bigint NOT NULL,
    role text DEFAULT 'primary'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    installed_at timestamp with time zone,
    removed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transit_stop_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transit_stop_assets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transit_stop_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transit_stop_assets_id_seq OWNED BY public.transit_stop_assets.id;


--
-- Name: transit_stop_assets_v1; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.transit_stop_assets_v1 AS
 SELECT ts.stop_id,
    tsa.asset_id,
    tsa.role,
    tsa.active,
    tsa.installed_at,
    tsa.removed_at,
    tsa.notes,
    a.org_id,
    a.asset_type_id,
    a.lon,
    a.lat,
    a.display_name
   FROM ((public.transit_stops ts
     LEFT JOIN public.transit_stop_assets tsa ON ((tsa.stop_id = ts.stop_id)))
     LEFT JOIN public.assets a ON ((a.id = tsa.asset_id)));


--
-- Name: trash_volume_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trash_volume_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trash_volume_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trash_volume_logs_id_seq OWNED BY public.trash_volume_logs.id;


--
-- Name: asset_locations id; Type: DEFAULT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.asset_locations ALTER COLUMN id SET DEFAULT nextval('core.asset_locations_id_seq'::regclass);


--
-- Name: assignments id; Type: DEFAULT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.assignments ALTER COLUMN id SET DEFAULT nextval('core.assignments_id_seq'::regclass);


--
-- Name: evidence id; Type: DEFAULT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.evidence ALTER COLUMN id SET DEFAULT nextval('core.evidence_id_seq'::regclass);


--
-- Name: location_external_ids id; Type: DEFAULT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.location_external_ids ALTER COLUMN id SET DEFAULT nextval('core.location_external_ids_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.locations ALTER COLUMN id SET DEFAULT nextval('core.locations_id_seq'::regclass);


--
-- Name: observations id; Type: DEFAULT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observations ALTER COLUMN id SET DEFAULT nextval('core.observations_id_seq'::regclass);


--
-- Name: visits id; Type: DEFAULT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.visits ALTER COLUMN id SET DEFAULT nextval('core.visits_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: clean_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_logs ALTER COLUMN id SET DEFAULT nextval('public.clean_logs_id_seq'::regclass);


--
-- Name: eam_bridge_route_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eam_bridge_route_log ALTER COLUMN id SET DEFAULT nextval('public.eam_bridge_route_log_id_seq'::regclass);


--
-- Name: export_delete_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_delete_tokens ALTER COLUMN id SET DEFAULT nextval('public.export_delete_tokens_id_seq'::regclass);


--
-- Name: hazards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hazards ALTER COLUMN id SET DEFAULT nextval('public.hazards_id_seq'::regclass);


--
-- Name: infrastructure_issues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_issues ALTER COLUMN id SET DEFAULT nextval('public.infrastructure_issues_id_seq'::regclass);


--
-- Name: level3_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level3_logs ALTER COLUMN id SET DEFAULT nextval('public.level3_logs_id_seq'::regclass);


--
-- Name: route_run_stops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_run_stops ALTER COLUMN id SET DEFAULT nextval('public.route_run_stops_id_seq'::regclass);


--
-- Name: route_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_runs ALTER COLUMN id SET DEFAULT nextval('public.route_runs_id_seq'::regclass);


--
-- Name: stop_photos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_photos ALTER COLUMN id SET DEFAULT nextval('public.stop_photos_id_seq'::regclass);


--
-- Name: transit_stop_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stop_assets ALTER COLUMN id SET DEFAULT nextval('public.transit_stop_assets_id_seq'::regclass);


--
-- Name: trash_volume_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_volume_logs ALTER COLUMN id SET DEFAULT nextval('public.trash_volume_logs_id_seq'::regclass);


--
-- Name: asset_locations asset_locations_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.asset_locations
    ADD CONSTRAINT asset_locations_pkey PRIMARY KEY (id);


--
-- Name: asset_types asset_types_org_id_type_key_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.asset_types
    ADD CONSTRAINT asset_types_org_id_type_key_key UNIQUE (org_id, type_key);


--
-- Name: asset_types asset_types_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.asset_types
    ADD CONSTRAINT asset_types_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: evidence evidence_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.evidence
    ADD CONSTRAINT evidence_pkey PRIMARY KEY (id);


--
-- Name: location_external_ids location_external_ids_org_id_source_system_external_id_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.location_external_ids
    ADD CONSTRAINT location_external_ids_org_id_source_system_external_id_key UNIQUE (org_id, source_system, external_id);


--
-- Name: location_external_ids location_external_ids_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.location_external_ids
    ADD CONSTRAINT location_external_ids_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: observation_type_registry observation_type_registry_org_id_asset_type_id_observation__key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observation_type_registry
    ADD CONSTRAINT observation_type_registry_org_id_asset_type_id_observation__key UNIQUE (org_id, asset_type_id, observation_key);


--
-- Name: observation_type_registry observation_type_registry_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observation_type_registry
    ADD CONSTRAINT observation_type_registry_pkey PRIMARY KEY (id);


--
-- Name: observations observations_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observations
    ADD CONSTRAINT observations_pkey PRIMARY KEY (id);


--
-- Name: visits visits_client_visit_id_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_client_visit_id_key UNIQUE (client_visit_id);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: asset_external_ids asset_external_ids_asset_id_external_system_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_external_ids
    ADD CONSTRAINT asset_external_ids_asset_id_external_system_key UNIQUE (asset_id, external_system);


--
-- Name: asset_external_ids asset_external_ids_external_system_external_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_external_ids
    ADD CONSTRAINT asset_external_ids_external_system_external_key_key UNIQUE (external_system, external_key);


--
-- Name: asset_external_ids asset_external_ids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_external_ids
    ADD CONSTRAINT asset_external_ids_pkey PRIMARY KEY (id);


--
-- Name: asset_types asset_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_types_code_key UNIQUE (code);


--
-- Name: asset_types asset_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_types_pkey PRIMARY KEY (id);


--
-- Name: assets assets_org_id_asset_type_id_seed_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_org_id_asset_type_id_seed_key_key UNIQUE (org_id, asset_type_id, seed_key);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bases bases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bases
    ADD CONSTRAINT bases_pkey PRIMARY KEY (id);


--
-- Name: clean_logs clean_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_logs
    ADD CONSTRAINT clean_logs_pkey PRIMARY KEY (id);


--
-- Name: eam_bridge_populate_state eam_bridge_populate_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eam_bridge_populate_state
    ADD CONSTRAINT eam_bridge_populate_state_pkey PRIMARY KEY (id);


--
-- Name: eam_bridge_route_log eam_bridge_route_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eam_bridge_route_log
    ADD CONSTRAINT eam_bridge_route_log_pkey PRIMARY KEY (id);


--
-- Name: eam_bridge_route_log eam_bridge_route_log_run_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eam_bridge_route_log
    ADD CONSTRAINT eam_bridge_route_log_run_unique UNIQUE (route_run_id);


--
-- Name: export_delete_tokens export_delete_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_delete_tokens
    ADD CONSTRAINT export_delete_tokens_pkey PRIMARY KEY (id);


--
-- Name: export_delete_tokens export_delete_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_delete_tokens
    ADD CONSTRAINT export_delete_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: hazards hazards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hazards
    ADD CONSTRAINT hazards_pkey PRIMARY KEY (id);


--
-- Name: identity_directory identity_directory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_directory
    ADD CONSTRAINT identity_directory_pkey PRIMARY KEY (oid);


--
-- Name: infrastructure_issues infrastructure_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_issues
    ADD CONSTRAINT infrastructure_issues_pkey PRIMARY KEY (id);


--
-- Name: lead_route_overrides lead_route_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_route_overrides
    ADD CONSTRAINT lead_route_overrides_pkey PRIMARY KEY (id);


--
-- Name: level3_logs level3_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level3_logs
    ADD CONSTRAINT level3_logs_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: route_pools route_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_pools
    ADD CONSTRAINT route_pools_pkey PRIMARY KEY (id);


--
-- Name: route_run_stops route_run_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_run_stops
    ADD CONSTRAINT route_run_stops_pkey PRIMARY KEY (id);


--
-- Name: route_runs route_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_runs
    ADD CONSTRAINT route_runs_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: stop_condition_history stop_condition_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_condition_history
    ADD CONSTRAINT stop_condition_history_pkey PRIMARY KEY (id);


--
-- Name: stop_condition_history stop_condition_history_stop_id_visit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_condition_history
    ADD CONSTRAINT stop_condition_history_stop_id_visit_id_key UNIQUE (stop_id, visit_id);


--
-- Name: stop_effort_history stop_effort_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_effort_history
    ADD CONSTRAINT stop_effort_history_pkey PRIMARY KEY (id);


--
-- Name: stop_effort_history stop_effort_history_stop_id_visit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_effort_history
    ADD CONSTRAINT stop_effort_history_stop_id_visit_id_key UNIQUE (stop_id, visit_id);


--
-- Name: stop_photos stop_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_photos
    ADD CONSTRAINT stop_photos_pkey PRIMARY KEY (id);


--
-- Name: stop_risk_snapshot stop_risk_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_risk_snapshot
    ADD CONSTRAINT stop_risk_snapshot_pkey PRIMARY KEY (stop_id);


--
-- Name: stops_legacy stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stops_legacy
    ADD CONSTRAINT stops_pkey PRIMARY KEY ("STOP_ID");


--
-- Name: transit_stop_assets transit_stop_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stop_assets
    ADD CONSTRAINT transit_stop_assets_pkey PRIMARY KEY (id);


--
-- Name: transit_stops transit_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stops
    ADD CONSTRAINT transit_stops_pkey PRIMARY KEY (stop_id);


--
-- Name: trash_volume_logs trash_volume_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_volume_logs
    ADD CONSTRAINT trash_volume_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_core_asset_locations_asset; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_core_asset_locations_asset ON core.asset_locations USING btree (org_id, asset_id);


--
-- Name: idx_core_asset_locations_location; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_core_asset_locations_location ON core.asset_locations USING btree (org_id, location_id);


--
-- Name: idx_core_assignments_org_status; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_core_assignments_org_status ON core.assignments USING btree (org_id, status);


--
-- Name: idx_core_evidence_visit; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_core_evidence_visit ON core.evidence USING btree (visit_id);


--
-- Name: idx_core_observations_visit; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_core_observations_visit ON core.observations USING btree (visit_id);


--
-- Name: idx_core_visits_asset_time; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_core_visits_asset_time ON core.visits USING btree (org_id, primary_asset_id, started_at DESC);


--
-- Name: idx_core_visits_location_time; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_core_visits_location_time ON core.visits USING btree (org_id, location_id, started_at DESC);


--
-- Name: ux_location_one_id_per_system; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX ux_location_one_id_per_system ON core.location_external_ids USING btree (org_id, location_id, source_system);


--
-- Name: asset_external_ids_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_external_ids_asset_idx ON public.asset_external_ids USING btree (asset_id);


--
-- Name: assets_lon_lat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_lon_lat_idx ON public.assets USING btree (lon, lat);


--
-- Name: assets_org_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_org_type_idx ON public.assets USING btree (org_id, asset_type_id);


--
-- Name: audit_log_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_actor ON public.audit_log USING btree (actor_oid, occurred_at DESC);


--
-- Name: audit_log_org_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_org_occurred ON public.audit_log USING btree (org_id, occurred_at DESC);


--
-- Name: cleanliness_risk_mv_pool_cleanliness_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cleanliness_risk_mv_pool_cleanliness_idx ON public.cleanliness_risk_mv USING btree (pool_id, cleanliness_score DESC);


--
-- Name: cleanliness_risk_mv_pool_overdue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cleanliness_risk_mv_pool_overdue_idx ON public.cleanliness_risk_mv USING btree (pool_id, is_overdue_30d, days_since_last_l3 DESC);


--
-- Name: cleanliness_risk_mv_stop_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cleanliness_risk_mv_stop_id_uniq ON public.cleanliness_risk_mv USING btree (stop_id);


--
-- Name: eam_bridge_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eam_bridge_completed_at ON public.eam_bridge_route_log USING btree (completed_at DESC);


--
-- Name: eam_bridge_org_logged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eam_bridge_org_logged ON public.eam_bridge_route_log USING btree (org_id, logged_at DESC);


--
-- Name: export_delete_tokens_org_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX export_delete_tokens_org_expires ON public.export_delete_tokens USING btree (org_id, expires_at);


--
-- Name: hazards_stop_id_reported_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hazards_stop_id_reported_at_idx ON public.hazards USING btree (stop_id, reported_at);


--
-- Name: idx_assets_org_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_assets_org_external_id ON public.assets USING btree (org_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_bases_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bases_org_id ON public.bases USING btree (org_id);


--
-- Name: idx_clean_logs_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clean_logs_stop_id ON public.clean_logs USING btree (stop_id);


--
-- Name: idx_clean_logs_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clean_logs_visit_id ON public.clean_logs USING btree (visit_id);


--
-- Name: idx_hazards_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazards_stop_id ON public.hazards USING btree (stop_id);


--
-- Name: idx_hazards_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazards_visit_id ON public.hazards USING btree (visit_id);


--
-- Name: idx_identity_directory_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_identity_directory_org_id ON public.identity_directory USING btree (org_id);


--
-- Name: idx_infrastructure_issues_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_infrastructure_issues_stop_id ON public.infrastructure_issues USING btree (stop_id);


--
-- Name: idx_infrastructure_issues_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_infrastructure_issues_visit_id ON public.infrastructure_issues USING btree (visit_id);


--
-- Name: idx_level3_logs_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_level3_logs_stop_id ON public.level3_logs USING btree (stop_id);


--
-- Name: idx_level3_logs_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_level3_logs_visit_id ON public.level3_logs USING btree (visit_id);


--
-- Name: idx_overrides_pool_stop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_pool_stop ON public.lead_route_overrides USING btree (pool_id, stop_id);


--
-- Name: idx_overrides_pool_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_pool_type ON public.lead_route_overrides USING btree (pool_id, override_type);


--
-- Name: idx_riskmap_combined_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_riskmap_combined_score ON public.stop_risk_snapshot USING btree (combined_risk_score DESC);


--
-- Name: idx_riskmap_l3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_riskmap_l3 ON public.stop_risk_snapshot USING btree (days_since_last_l3 DESC);


--
-- Name: idx_route_pools_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_pools_org_id ON public.route_pools USING btree (org_id);


--
-- Name: idx_route_run_stops_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_run_stops_asset_id ON public.route_run_stops USING btree (asset_id);


--
-- Name: idx_route_run_stops_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_run_stops_run_id ON public.route_run_stops USING btree (route_run_id, sequence);


--
-- Name: idx_route_run_stops_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_run_stops_stop_id ON public.route_run_stops USING btree (stop_id);


--
-- Name: idx_route_runs_assigned_user_oid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_runs_assigned_user_oid ON public.route_runs USING btree (assigned_user_oid);


--
-- Name: idx_route_runs_created_by_oid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_runs_created_by_oid ON public.route_runs USING btree (created_by_oid);


--
-- Name: idx_route_runs_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_runs_org_id ON public.route_runs USING btree (org_id);


--
-- Name: idx_stop_condition_stop_scored; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stop_condition_stop_scored ON public.stop_condition_history USING btree (stop_id, scored_at DESC);


--
-- Name: idx_stop_effort_run_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stop_effort_run_date ON public.stop_effort_history USING btree (run_date);


--
-- Name: idx_stop_effort_stop_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stop_effort_stop_date ON public.stop_effort_history USING btree (stop_id, run_date);


--
-- Name: idx_stop_photos_route_run_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stop_photos_route_run_stop_id ON public.stop_photos USING btree (route_run_stop_id);


--
-- Name: idx_stop_photos_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stop_photos_visit_id ON public.stop_photos USING btree (visit_id);


--
-- Name: idx_stop_risk_snapshot_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stop_risk_snapshot_stop_id ON public.stop_risk_snapshot USING btree (stop_id);


--
-- Name: idx_stops_pool_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stops_pool_id ON public.stops_legacy USING btree (pool_id);


--
-- Name: idx_trash_volume_logs_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trash_volume_logs_stop_id ON public.trash_volume_logs USING btree (stop_id);


--
-- Name: idx_trash_volume_logs_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trash_volume_logs_visit_id ON public.trash_volume_logs USING btree (visit_id);


--
-- Name: infrastructure_issues_stop_id_reported_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infrastructure_issues_stop_id_reported_at_idx ON public.infrastructure_issues USING btree (stop_id, reported_at);


--
-- Name: infrastructure_risk_mv_pool_infra_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infrastructure_risk_mv_pool_infra_idx ON public.infrastructure_risk_mv USING btree (pool_id, infrastructure_score DESC);


--
-- Name: infrastructure_risk_mv_stop_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX infrastructure_risk_mv_stop_id_uniq ON public.infrastructure_risk_mv USING btree (stop_id);


--
-- Name: level3_compliance_mv_pool_overdue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX level3_compliance_mv_pool_overdue_idx ON public.level3_compliance_mv USING btree (pool_id, is_overdue_30d, days_since_last_l3 DESC);


--
-- Name: level3_compliance_mv_stop_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX level3_compliance_mv_stop_id_uniq ON public.level3_compliance_mv USING btree (stop_id);


--
-- Name: level3_logs_stop_id_cleaned_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX level3_logs_stop_id_cleaned_at_idx ON public.level3_logs USING btree (stop_id, cleaned_at);


--
-- Name: organizations_tenant_uuid_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_tenant_uuid_key ON public.organizations USING btree (tenant_uuid) WHERE (tenant_uuid IS NOT NULL);


--
-- Name: route_pools_base_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_pools_base_id_idx ON public.route_pools USING btree (base_id);


--
-- Name: route_run_stops_origin_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_run_stops_origin_type_idx ON public.route_run_stops USING btree (origin_type);


--
-- Name: route_run_stops_route_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_run_stops_route_run_id_idx ON public.route_run_stops USING btree (route_run_id);


--
-- Name: route_runs_run_date_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_runs_run_date_status_idx ON public.route_runs USING btree (run_date, status);


--
-- Name: safety_risk_mv_pool_safety_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_risk_mv_pool_safety_idx ON public.safety_risk_mv USING btree (pool_id, safety_score DESC);


--
-- Name: safety_risk_mv_recent_hazard_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_risk_mv_recent_hazard_idx ON public.safety_risk_mv USING btree (has_recent_hazard, hazard_days_ago);


--
-- Name: safety_risk_mv_stop_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX safety_risk_mv_stop_id_uniq ON public.safety_risk_mv USING btree (stop_id);


--
-- Name: stop_status_mv_pool_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stop_status_mv_pool_idx ON public.stop_status_mv USING btree (pool_id);


--
-- Name: stop_status_mv_stop_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stop_status_mv_stop_id_uniq ON public.stop_status_mv USING btree (stop_id);


--
-- Name: trash_volume_logs_route_run_stop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trash_volume_logs_route_run_stop_id_idx ON public.trash_volume_logs USING btree (route_run_stop_id);


--
-- Name: trash_volume_logs_stop_id_logged_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trash_volume_logs_stop_id_logged_at_idx ON public.trash_volume_logs USING btree (stop_id, logged_at);


--
-- Name: ux_transit_stop_assets_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_transit_stop_assets_active ON public.transit_stop_assets USING btree (stop_id, asset_id, role) WHERE (active = true);


--
-- Name: ux_transit_stop_assets_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_transit_stop_assets_one_primary ON public.transit_stop_assets USING btree (stop_id) WHERE ((active = true) AND (role = 'primary'::text));


--
-- Name: location_external_ids trg_location_external_ids_org_match; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER trg_location_external_ids_org_match BEFORE INSERT OR UPDATE ON core.location_external_ids FOR EACH ROW EXECUTE FUNCTION core.enforce_location_external_ids_org_match();


--
-- Name: route_pools trg_route_pools_lock_org_base; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_route_pools_lock_org_base BEFORE UPDATE OF org_id, base_id ON public.route_pools FOR EACH ROW EXECUTE FUNCTION public.prevent_route_pool_org_base_change_if_used();


--
-- Name: route_runs trg_route_runs_pool_invariant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_route_runs_pool_invariant BEFORE INSERT OR UPDATE OF route_pool_id, org_id, base_id ON public.route_runs FOR EACH ROW EXECUTE FUNCTION public.enforce_route_runs_pool_invariant();


--
-- Name: stops trg_stops_readonly; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stops_readonly INSTEAD OF INSERT OR DELETE OR UPDATE ON public.stops FOR EACH ROW EXECUTE FUNCTION public.stops_readonly();


--
-- Name: transit_stops trg_sync_transit_stop_primary_asset; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_transit_stop_primary_asset AFTER INSERT OR UPDATE OF asset_id ON public.transit_stops FOR EACH ROW EXECUTE FUNCTION public.sync_transit_stop_primary_asset();


--
-- Name: asset_locations asset_locations_asset_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.asset_locations
    ADD CONSTRAINT asset_locations_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE RESTRICT;


--
-- Name: asset_locations asset_locations_location_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.asset_locations
    ADD CONSTRAINT asset_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES core.locations(id) ON DELETE CASCADE;


--
-- Name: asset_locations asset_locations_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.asset_locations
    ADD CONSTRAINT asset_locations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: asset_types asset_types_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.asset_types
    ADD CONSTRAINT asset_types_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: assignments assignments_location_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.assignments
    ADD CONSTRAINT assignments_location_id_fkey FOREIGN KEY (location_id) REFERENCES core.locations(id) ON DELETE SET NULL;


--
-- Name: assignments assignments_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.assignments
    ADD CONSTRAINT assignments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: assignments assignments_primary_asset_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.assignments
    ADD CONSTRAINT assignments_primary_asset_id_fkey FOREIGN KEY (primary_asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: evidence evidence_observation_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.evidence
    ADD CONSTRAINT evidence_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES core.observations(id) ON DELETE SET NULL;


--
-- Name: evidence evidence_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.evidence
    ADD CONSTRAINT evidence_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: evidence evidence_visit_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.evidence
    ADD CONSTRAINT evidence_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE CASCADE;


--
-- Name: location_external_ids location_external_ids_location_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.location_external_ids
    ADD CONSTRAINT location_external_ids_location_id_fkey FOREIGN KEY (location_id) REFERENCES core.locations(id) ON DELETE CASCADE;


--
-- Name: location_external_ids location_external_ids_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.location_external_ids
    ADD CONSTRAINT location_external_ids_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: locations locations_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.locations
    ADD CONSTRAINT locations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: observation_type_registry observation_type_registry_asset_type_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observation_type_registry
    ADD CONSTRAINT observation_type_registry_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES core.asset_types(id) ON DELETE CASCADE;


--
-- Name: observation_type_registry observation_type_registry_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observation_type_registry
    ADD CONSTRAINT observation_type_registry_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: observations observations_asset_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observations
    ADD CONSTRAINT observations_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: observations observations_location_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observations
    ADD CONSTRAINT observations_location_id_fkey FOREIGN KEY (location_id) REFERENCES core.locations(id) ON DELETE SET NULL;


--
-- Name: observations observations_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observations
    ADD CONSTRAINT observations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: observations observations_visit_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.observations
    ADD CONSTRAINT observations_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE CASCADE;


--
-- Name: visits visits_assignment_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES core.assignments(id) ON DELETE SET NULL;


--
-- Name: visits visits_location_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_location_id_fkey FOREIGN KEY (location_id) REFERENCES core.locations(id) ON DELETE SET NULL;


--
-- Name: visits visits_org_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: visits visits_primary_asset_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_primary_asset_id_fkey FOREIGN KEY (primary_asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: asset_external_ids asset_external_ids_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_external_ids
    ADD CONSTRAINT asset_external_ids_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: assets assets_asset_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id) ON DELETE RESTRICT;


--
-- Name: assets assets_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: bases bases_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bases
    ADD CONSTRAINT bases_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: clean_logs clean_logs_asset_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_logs
    ADD CONSTRAINT clean_logs_asset_id_fk FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: clean_logs clean_logs_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_logs
    ADD CONSTRAINT clean_logs_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id);


--
-- Name: clean_logs clean_logs_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_logs
    ADD CONSTRAINT clean_logs_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE SET NULL;


--
-- Name: eam_bridge_route_log eam_bridge_route_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eam_bridge_route_log
    ADD CONSTRAINT eam_bridge_route_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: eam_bridge_route_log eam_bridge_route_log_route_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eam_bridge_route_log
    ADD CONSTRAINT eam_bridge_route_log_route_run_id_fkey FOREIGN KEY (route_run_id) REFERENCES public.route_runs(id);


--
-- Name: route_runs fk_route_runs_org; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_runs
    ADD CONSTRAINT fk_route_runs_org FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: hazards hazards_asset_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hazards
    ADD CONSTRAINT hazards_asset_id_fk FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: hazards hazards_route_run_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hazards
    ADD CONSTRAINT hazards_route_run_stop_id_fkey FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id) ON DELETE SET NULL;


--
-- Name: hazards hazards_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hazards
    ADD CONSTRAINT hazards_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id);


--
-- Name: hazards hazards_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hazards
    ADD CONSTRAINT hazards_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE SET NULL;


--
-- Name: identity_directory identity_directory_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_directory
    ADD CONSTRAINT identity_directory_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: infrastructure_issues infrastructure_issues_asset_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_issues
    ADD CONSTRAINT infrastructure_issues_asset_id_fk FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: infrastructure_issues infrastructure_issues_route_run_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_issues
    ADD CONSTRAINT infrastructure_issues_route_run_stop_id_fkey FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id) ON DELETE SET NULL;


--
-- Name: infrastructure_issues infrastructure_issues_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_issues
    ADD CONSTRAINT infrastructure_issues_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id);


--
-- Name: infrastructure_issues infrastructure_issues_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_issues
    ADD CONSTRAINT infrastructure_issues_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE SET NULL;


--
-- Name: level3_logs level3_logs_asset_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level3_logs
    ADD CONSTRAINT level3_logs_asset_id_fk FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: level3_logs level3_logs_route_run_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level3_logs
    ADD CONSTRAINT level3_logs_route_run_stop_id_fkey FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id) ON DELETE SET NULL;


--
-- Name: level3_logs level3_logs_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level3_logs
    ADD CONSTRAINT level3_logs_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id);


--
-- Name: level3_logs level3_logs_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level3_logs
    ADD CONSTRAINT level3_logs_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE SET NULL;


--
-- Name: route_pools route_pools_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_pools
    ADD CONSTRAINT route_pools_base_id_fkey FOREIGN KEY (base_id) REFERENCES public.bases(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: route_pools route_pools_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_pools
    ADD CONSTRAINT route_pools_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: route_run_stops route_run_stops_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_run_stops
    ADD CONSTRAINT route_run_stops_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: route_run_stops route_run_stops_hazard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_run_stops
    ADD CONSTRAINT route_run_stops_hazard_id_fkey FOREIGN KEY (hazard_id) REFERENCES public.hazards(id) ON DELETE SET NULL;


--
-- Name: route_run_stops route_run_stops_infra_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_run_stops
    ADD CONSTRAINT route_run_stops_infra_issue_id_fkey FOREIGN KEY (infra_issue_id) REFERENCES public.infrastructure_issues(id) ON DELETE SET NULL;


--
-- Name: route_run_stops route_run_stops_route_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_run_stops
    ADD CONSTRAINT route_run_stops_route_run_id_fkey FOREIGN KEY (route_run_id) REFERENCES public.route_runs(id) ON DELETE CASCADE;


--
-- Name: route_run_stops route_run_stops_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_run_stops
    ADD CONSTRAINT route_run_stops_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id);


--
-- Name: route_runs route_runs_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_runs
    ADD CONSTRAINT route_runs_base_id_fkey FOREIGN KEY (base_id) REFERENCES public.bases(id);


--
-- Name: route_runs route_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_runs
    ADD CONSTRAINT route_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: route_runs route_runs_route_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_runs
    ADD CONSTRAINT route_runs_route_pool_id_fkey FOREIGN KEY (route_pool_id) REFERENCES public.route_pools(id);


--
-- Name: stop_condition_history stop_condition_history_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_condition_history
    ADD CONSTRAINT stop_condition_history_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: stop_condition_history stop_condition_history_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_condition_history
    ADD CONSTRAINT stop_condition_history_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) ON DELETE CASCADE;


--
-- Name: stop_condition_history stop_condition_history_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_condition_history
    ADD CONSTRAINT stop_condition_history_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE CASCADE;


--
-- Name: stop_effort_history stop_effort_history_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_effort_history
    ADD CONSTRAINT stop_effort_history_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) ON DELETE CASCADE;


--
-- Name: stop_effort_history stop_effort_history_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_effort_history
    ADD CONSTRAINT stop_effort_history_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE CASCADE;


--
-- Name: stop_photos stop_photos_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_photos
    ADD CONSTRAINT stop_photos_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: stop_photos stop_photos_route_run_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_photos
    ADD CONSTRAINT stop_photos_route_run_stop_id_fkey FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id) ON DELETE CASCADE;


--
-- Name: stop_photos stop_photos_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_photos
    ADD CONSTRAINT stop_photos_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE SET NULL;


--
-- Name: stop_risk_snapshot stop_risk_snapshot_asset_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_risk_snapshot
    ADD CONSTRAINT stop_risk_snapshot_asset_id_fk FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: stop_risk_snapshot stop_risk_snapshot_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_risk_snapshot
    ADD CONSTRAINT stop_risk_snapshot_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id);


--
-- Name: transit_stop_assets transit_stop_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stop_assets
    ADD CONSTRAINT transit_stop_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE RESTRICT;


--
-- Name: transit_stop_assets transit_stop_assets_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stop_assets
    ADD CONSTRAINT transit_stop_assets_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) ON DELETE CASCADE;


--
-- Name: transit_stops transit_stops_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stops
    ADD CONSTRAINT transit_stops_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: trash_volume_logs trash_volume_logs_asset_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_volume_logs
    ADD CONSTRAINT trash_volume_logs_asset_id_fk FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: trash_volume_logs trash_volume_logs_route_run_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_volume_logs
    ADD CONSTRAINT trash_volume_logs_route_run_stop_id_fkey FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id) ON DELETE SET NULL;


--
-- Name: trash_volume_logs trash_volume_logs_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_volume_logs
    ADD CONSTRAINT trash_volume_logs_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id);


--
-- Name: trash_volume_logs trash_volume_logs_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_volume_logs
    ADD CONSTRAINT trash_volume_logs_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE SET NULL;


--
-- Name: asset_locations; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.asset_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_types; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.asset_types ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: evidence; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: location_external_ids; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.location_external_ids ENABLE ROW LEVEL SECURITY;

--
-- Name: locations; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: observation_type_registry; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.observation_type_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: observations; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.observations ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_locations org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.asset_locations USING ((org_id = (current_setting('app.current_org_id'::text, true))::bigint));


--
-- Name: POLICY org_isolation ON asset_locations; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.asset_locations IS 'Tenant isolation — mirrors Tier 7 pattern. Missed in original RLS migration.';


--
-- Name: asset_types org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.asset_types USING (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint))) WITH CHECK (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)));


--
-- Name: POLICY org_isolation ON asset_types; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.asset_types IS 'Tier 7 tenant isolation pattern. Filters all ops by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';


--
-- Name: assignments org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.assignments USING (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint))) WITH CHECK (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)));


--
-- Name: POLICY org_isolation ON assignments; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.assignments IS 'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';


--
-- Name: evidence org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.evidence USING (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint))) WITH CHECK (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)));


--
-- Name: POLICY org_isolation ON evidence; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.evidence IS 'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';


--
-- Name: location_external_ids org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.location_external_ids USING ((org_id = (current_setting('app.current_org_id'::text, true))::bigint));


--
-- Name: POLICY org_isolation ON location_external_ids; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.location_external_ids IS 'Tenant isolation — mirrors Tier 7 pattern. Missed in original RLS migration.';


--
-- Name: locations org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.locations USING (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint))) WITH CHECK (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)));


--
-- Name: POLICY org_isolation ON locations; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.locations IS 'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';


--
-- Name: observation_type_registry org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.observation_type_registry USING (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint))) WITH CHECK (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)));


--
-- Name: POLICY org_isolation ON observation_type_registry; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.observation_type_registry IS 'Tier 7 tenant isolation pattern. Filters all ops by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';


--
-- Name: observations org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.observations USING (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint))) WITH CHECK (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)));


--
-- Name: POLICY org_isolation ON observations; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.observations IS 'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';


--
-- Name: visits org_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY org_isolation ON core.visits USING (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint))) WITH CHECK (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)));


--
-- Name: POLICY org_isolation ON visits; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON POLICY org_isolation ON core.visits IS 'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';


--
-- Name: visits; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.visits ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_delete ON public.audit_log FOR DELETE USING (((current_setting('app.export_delete_active'::text, true) = 'true'::text) AND ((org_id)::text = NULLIF(current_setting('app.export_delete_org_id'::text, true), ''::text))));


--
-- Name: POLICY audit_log_delete ON audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY audit_log_delete ON public.audit_log IS 'Allows DELETE only when SET LOCAL app.export_delete_active = true and app.export_delete_org_id matches the row''s org_id. SET LOCAL resets at COMMIT — cannot be exploited outside a transaction. Used exclusively by POST /api/admin/export-and-delete/execute.';


--
-- Name: audit_log audit_log_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT WITH CHECK (true);


--
-- Name: audit_log audit_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_select ON public.audit_log FOR SELECT USING (true);


--
-- Name: identity_directory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.identity_directory ENABLE ROW LEVEL SECURITY;

--
-- Name: identity_directory org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_isolation ON public.identity_directory USING ((org_id = (current_setting('app.current_org_id'::text, true))::bigint));


--
-- PostgreSQL database dump complete
--

\unrestrict ZIkNjchdOKO9Qz1J3ccQAEMgEAuMyjfSw0LfTMS9mD4Wp0RqaOOWhLRgL3qkgCR

