CREATE TABLE public.incident_containment_models (
 incident_id uuid PRIMARY KEY REFERENCES public.incidents(id) ON DELETE CASCADE,
 model jsonb NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.incident_containment_models TO authenticated;
GRANT ALL ON public.incident_containment_models TO service_role;
REVOKE ALL ON public.incident_containment_models FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.incident_containment_models FROM authenticated;
ALTER TABLE public.incident_containment_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY containment_model_member_read ON public.incident_containment_models FOR SELECT TO authenticated USING (private.incident_role(incident_id) IS NOT NULL);

CREATE TABLE public.incident_containment_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
 title text NOT NULL,
 isolated_system_id uuid NOT NULL,
 model_snapshot jsonb NOT NULL,
 results jsonb NOT NULL,
 created_by uuid NOT NULL,
 author_name text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT ON public.incident_containment_plans TO authenticated;
GRANT ALL ON public.incident_containment_plans TO service_role;
REVOKE ALL ON public.incident_containment_plans FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.incident_containment_plans FROM authenticated;
ALTER TABLE public.incident_containment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY containment_plan_member_read ON public.incident_containment_plans FOR SELECT TO authenticated USING (private.incident_role(incident_id) IS NOT NULL);
CREATE INDEX containment_plans_incident_idx ON public.incident_containment_plans(incident_id, created_at DESC);

CREATE FUNCTION private.prevent_plan_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Saved containment plans are immutable'; END; $$;
REVOKE ALL ON FUNCTION private.prevent_plan_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER containment_plan_immutable BEFORE UPDATE OR DELETE ON public.incident_containment_plans FOR EACH ROW EXECUTE FUNCTION private.prevent_plan_mutation();

CREATE FUNCTION private.containment_uuid_list(_value jsonb, _limit int) RETURNS uuid[] LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result uuid[];
BEGIN
 IF jsonb_typeof(_value) IS DISTINCT FROM 'array' OR jsonb_array_length(_value) > _limit THEN RAISE EXCEPTION 'Invalid containment model' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(_value) v WHERE jsonb_typeof(v) <> 'string' OR (v #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'Invalid containment model' USING ERRCODE='22023'; END IF;
 result := ARRAY(SELECT DISTINCT v::uuid FROM jsonb_array_elements_text(_value) v ORDER BY 1);
 IF cardinality(result) <> jsonb_array_length(_value) THEN RAISE EXCEPTION 'Containment model contains duplicates' USING ERRCODE='22023'; END IF;
 RETURN result;
END; $$;

CREATE FUNCTION private.containment_edge_list(_value jsonb, _systems uuid[], _limit int) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(_value) IS DISTINCT FROM 'array' OR jsonb_array_length(_value) > _limit THEN RAISE EXCEPTION 'Invalid containment model' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(_value) e WHERE jsonb_typeof(e) <> 'object'
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) k) IS DISTINCT FROM ARRAY['from','to']
   OR jsonb_typeof(e->'from') <> 'string' OR jsonb_typeof(e->'to') <> 'string'
   OR (e->>'from') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR (e->>'to') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'Invalid containment model' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(_value) e WHERE (e->>'from') = (e->>'to') OR NOT ((e->>'from')::uuid = ANY(_systems)) OR NOT ((e->>'to')::uuid = ANY(_systems))) THEN RAISE EXCEPTION 'Connections must join two different modeled systems' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT (e->>'from', e->>'to')) FROM jsonb_array_elements(_value) e) <> jsonb_array_length(_value) THEN RAISE EXCEPTION 'Containment model contains duplicates' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('from', f, 'to', t) ORDER BY f, t), '[]'::jsonb) INTO result FROM (SELECT (e->>'from')::uuid f, (e->>'to')::uuid t FROM jsonb_array_elements(_value) e) x;
 RETURN result;
END; $$;

CREATE FUNCTION private.normalize_containment_model(_incident_id uuid, _model jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE systems uuid[]; starts uuid[]; critical uuid[];
BEGIN
 IF jsonb_typeof(_model) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(_model) k) IS DISTINCT FROM ARRAY['critical','dependencies','spread','starts','systems'] THEN RAISE EXCEPTION 'Invalid containment model' USING ERRCODE='22023'; END IF;
 systems := private.containment_uuid_list(_model->'systems', 25);
 starts := private.containment_uuid_list(_model->'starts', 25);
 critical := private.containment_uuid_list(_model->'critical', 25);
 IF EXISTS (SELECT 1 FROM unnest(systems) s WHERE NOT EXISTS (SELECT 1 FROM public.incident_affected_systems a WHERE a.id = s AND a.incident_id = _incident_id)) THEN RAISE EXCEPTION 'Modeled systems must be affected systems of this incident' USING ERRCODE='22023'; END IF;
 IF NOT (starts <@ systems) OR NOT (critical <@ systems) THEN RAISE EXCEPTION 'Starting points and critical systems must be modeled systems' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('systems', to_jsonb(systems), 'starts', to_jsonb(starts), 'critical', to_jsonb(critical),
  'spread', private.containment_edge_list(_model->'spread', systems, 60),
  'dependencies', private.containment_edge_list(_model->'dependencies', systems, 60));
END; $$;

-- Deterministic reachability. Spread link {from,to}: access on "from" could reach "to".
-- Dependency {from,to}: "from" needs "to" to operate. Isolation removes every spread link touching the isolated system
-- and takes the isolated system plus everything that transitively depends on it offline.
CREATE FUNCTION private.containment_results(_model jsonb, _isolated uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
WITH RECURSIVE
 spread AS (SELECT (e->>'from')::uuid f, (e->>'to')::uuid t FROM jsonb_array_elements(_model->'spread') e),
 deps AS (SELECT (e->>'from')::uuid f, (e->>'to')::uuid t FROM jsonb_array_elements(_model->'dependencies') e),
 starts AS (SELECT v::uuid id FROM jsonb_array_elements_text(_model->'starts') v),
 crit AS (SELECT v::uuid id FROM jsonb_array_elements_text(_model->'critical') v),
 base(id) AS (SELECT id FROM starts UNION SELECT s.t FROM spread s JOIN base b ON s.f = b.id),
 aft(id) AS (SELECT id FROM starts UNION SELECT s.t FROM spread s JOIN aft a ON s.f = a.id WHERE s.f <> _isolated AND s.t <> _isolated),
 off(id) AS (SELECT _isolated UNION SELECT d.f FROM deps d JOIN off o ON d.t = o.id),
 remaining AS (SELECT f, t FROM spread WHERE f IN (SELECT id FROM aft) AND f <> _isolated AND t <> _isolated),
 interrupted AS (SELECT f, t FROM spread WHERE f IN (SELECT id FROM base) EXCEPT SELECT f, t FROM remaining)
SELECT jsonb_build_object(
 'isolated', _isolated,
 'baseline_reachable', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM base),
 'reachable_after', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM aft),
 'newly_unreachable', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM base WHERE id NOT IN (SELECT id FROM aft)),
 'remaining_paths', (SELECT coalesce(jsonb_agg(jsonb_build_object('from', f, 'to', t) ORDER BY f, t), '[]'::jsonb) FROM remaining),
 'interrupted_paths', (SELECT coalesce(jsonb_agg(jsonb_build_object('from', f, 'to', t) ORDER BY f, t), '[]'::jsonb) FROM interrupted),
 'offline', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM off),
 'critical_offline', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM off WHERE id IN (SELECT id FROM crit)),
 'critical_reachable_after', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM aft WHERE id IN (SELECT id FROM crit))
); $$;
REVOKE ALL ON FUNCTION private.containment_uuid_list(jsonb, int), private.containment_edge_list(jsonb, uuid[], int), private.normalize_containment_model(uuid, jsonb), private.containment_results(jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_containment_model(_incident_id uuid, _model jsonb) RETURNS public.incident_containment_models LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid := auth.uid(); normalized jsonb; result public.incident_containment_models;
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.incidents WHERE id = _incident_id FOR UPDATE;
 IF private.incident_role(_incident_id) IS NULL OR private.incident_role(_incident_id) NOT IN ('commander','responder') THEN RAISE EXCEPTION 'Only commanders and responders can edit the containment model' USING ERRCODE='42501'; END IF;
 normalized := private.normalize_containment_model(_incident_id, _model);
 INSERT INTO public.incident_containment_models(incident_id, model, updated_by, updated_at) VALUES (_incident_id, normalized, caller, now())
 ON CONFLICT (incident_id) DO UPDATE SET model = EXCLUDED.model, updated_by = EXCLUDED.updated_by, updated_at = now()
 RETURNING * INTO result;
 RETURN result;
END; $$;

CREATE FUNCTION public.save_containment_plan(_incident_id uuid, _title text, _isolated_system_id uuid) RETURNS public.incident_containment_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid := auth.uid(); snapshot jsonb; label text; result public.incident_containment_plans;
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.incidents WHERE id = _incident_id FOR UPDATE;
 IF private.incident_role(_incident_id) IS NULL OR private.incident_role(_incident_id) NOT IN ('commander','responder') THEN RAISE EXCEPTION 'Only commanders and responders can save containment plans' USING ERRCODE='42501'; END IF;
 IF _title IS NULL OR char_length(btrim(_title)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Plan name must be 1 to 200 characters' USING ERRCODE='22023'; END IF;
 SELECT model INTO snapshot FROM public.incident_containment_models WHERE incident_id = _incident_id;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'Save the containment model first' USING ERRCODE='22023'; END IF;
 snapshot := private.normalize_containment_model(_incident_id, snapshot);
 IF _isolated_system_id IS NULL OR NOT (snapshot->'systems' ? _isolated_system_id::text) THEN RAISE EXCEPTION 'The isolated system must be part of the model' USING ERRCODE='22023'; END IF;
 label := left(coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'display_name'),''), nullif(btrim(auth.jwt()->'user_metadata'->>'full_name'),''), nullif(btrim(auth.jwt()->'user_metadata'->>'name'),'')), 100);
 INSERT INTO public.incident_containment_plans(incident_id, title, isolated_system_id, model_snapshot, results, created_by, author_name)
 VALUES (_incident_id, btrim(_title), _isolated_system_id, snapshot, private.containment_results(snapshot, _isolated_system_id), caller, label)
 RETURNING * INTO result;
 INSERT INTO public.incident_activity(incident_id, actor_id, actor_name, occurred_at, event_type, entity_id, details)
 VALUES (_incident_id, caller, label, result.created_at, 'containment_plan_saved', result.id, jsonb_build_object('plan_id', result.id, 'title', result.title, 'isolated_system_id', _isolated_system_id));
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.save_containment_model(uuid, jsonb), public.save_containment_plan(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_containment_model(uuid, jsonb), public.save_containment_plan(uuid, text, uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_containment_models;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_containment_plans;