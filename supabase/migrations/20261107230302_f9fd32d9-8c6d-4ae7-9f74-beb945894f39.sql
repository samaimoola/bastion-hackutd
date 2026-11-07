CREATE TABLE public.incident_affected_systems (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
 resource_name text NOT NULL, data_description text NOT NULL DEFAULT '', assessment text NOT NULL,
 data_conditions text[] NOT NULL, containment_status text NOT NULL, investigation_notes text NOT NULL DEFAULT '',
 created_by uuid NOT NULL, updated_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.incident_affected_systems TO authenticated;
REVOKE ALL ON public.incident_affected_systems FROM PUBLIC, anon, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.incident_affected_systems FROM authenticated;
ALTER TABLE public.incident_affected_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY affected_system_member_read ON public.incident_affected_systems FOR SELECT TO authenticated USING (private.incident_role(incident_id) IS NOT NULL);
CREATE INDEX affected_system_incident_idx ON public.incident_affected_systems(incident_id, created_at);
CREATE FUNCTION private.validate_affected_system() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.incident_id IS DISTINCT FROM OLD.incident_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN RAISE EXCEPTION 'Record identity and creation fields are immutable'; END IF;
 NEW.resource_name := btrim(NEW.resource_name);
 IF char_length(NEW.resource_name) NOT BETWEEN 1 AND 200 OR char_length(NEW.data_description)>10000 OR char_length(NEW.investigation_notes)>10000 THEN RAISE EXCEPTION 'Invalid affected system details'; END IF;
 IF NEW.assessment NOT IN ('suspected','confirmed') OR NEW.containment_status NOT IN ('not contained','in progress','contained') THEN RAISE EXCEPTION 'Invalid assessment or containment status'; END IF;
 IF cardinality(NEW.data_conditions) NOT BETWEEN 1 AND 4 OR array_position(NEW.data_conditions,NULL) IS NOT NULL OR NOT (NEW.data_conditions <@ ARRAY['encrypted','exfiltrated','unavailable','unknown']::text[]) OR cardinality(NEW.data_conditions) <> (SELECT count(DISTINCT value) FROM unnest(NEW.data_conditions) value) THEN RAISE EXCEPTION 'Invalid data conditions'; END IF;
 IF TG_OP='INSERT' THEN NEW.created_by := auth.uid(); NEW.created_at := clock_timestamp(); END IF;
 NEW.updated_by := auth.uid(); NEW.updated_at := clock_timestamp(); RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.validate_affected_system() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER affected_system_validate BEFORE INSERT OR UPDATE ON public.incident_affected_systems FOR EACH ROW EXECUTE FUNCTION private.validate_affected_system();
CREATE FUNCTION public.add_incident_affected_system(_incident_id uuid, _resource_name text, _data_description text, _assessment text, _data_conditions text[], _containment_status text, _investigation_notes text) RETURNS public.incident_affected_systems LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.incident_affected_systems;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.incidents WHERE id=_incident_id FOR UPDATE;
 IF private.incident_role(_incident_id) IS NULL OR private.incident_role(_incident_id) NOT IN ('commander','responder') THEN RAISE EXCEPTION 'Only commanders and responders can edit affected systems' USING ERRCODE='42501'; END IF;
 INSERT INTO public.incident_affected_systems(incident_id,resource_name,data_description,assessment,data_conditions,containment_status,investigation_notes,created_by,updated_by) VALUES(_incident_id,_resource_name,_data_description,_assessment,_data_conditions,_containment_status,_investigation_notes,auth.uid(),auth.uid()) RETURNING * INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.add_incident_affected_system(uuid,text,text,text,text[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_incident_affected_system(uuid,text,text,text,text[],text,text) TO authenticated;
CREATE FUNCTION public.update_incident_affected_system(_id uuid, _resource_name text, _data_description text, _assessment text, _data_conditions text[], _containment_status text, _investigation_notes text) RETURNS public.incident_affected_systems LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; result public.incident_affected_systems;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT incident_id INTO target FROM public.incident_affected_systems WHERE id=_id;
 PERFORM 1 FROM public.incidents WHERE id=target FOR UPDATE;
 IF private.incident_role(target) IS NULL OR private.incident_role(target) NOT IN ('commander','responder') THEN RAISE EXCEPTION 'Only commanders and responders can edit affected systems' USING ERRCODE='42501'; END IF;
 UPDATE public.incident_affected_systems SET resource_name=_resource_name,data_description=_data_description,assessment=_assessment,data_conditions=_data_conditions,containment_status=_containment_status,investigation_notes=_investigation_notes WHERE id=_id RETURNING * INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.update_incident_affected_system(uuid,text,text,text,text[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_incident_affected_system(uuid,text,text,text,text[],text,text) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_affected_systems;