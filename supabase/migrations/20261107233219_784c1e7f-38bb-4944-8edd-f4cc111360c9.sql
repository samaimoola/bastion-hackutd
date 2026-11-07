CREATE TABLE public.incident_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL, actor_name text, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 event_type text NOT NULL, entity_id uuid NOT NULL, details jsonb NOT NULL
);
GRANT SELECT ON public.incident_activity TO authenticated;
REVOKE ALL ON public.incident_activity FROM PUBLIC,anon,service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.incident_activity FROM authenticated;
ALTER TABLE public.incident_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_member_read ON public.incident_activity FOR SELECT TO authenticated USING(private.incident_role(incident_id) IS NOT NULL);
CREATE INDEX activity_incident_order_idx ON public.incident_activity(incident_id,occurred_at,id);
CREATE TABLE public.incident_activity_recording (singleton boolean PRIMARY KEY DEFAULT true, began_at timestamptz NOT NULL DEFAULT clock_timestamp());
GRANT SELECT ON public.incident_activity_recording TO authenticated;
REVOKE ALL ON public.incident_activity_recording FROM PUBLIC,anon,service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.incident_activity_recording FROM authenticated;
ALTER TABLE public.incident_activity_recording ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_recording_authenticated_read ON public.incident_activity_recording FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL);
INSERT INTO public.incident_activity_recording(singleton) VALUES(true);
CREATE FUNCTION private.prevent_activity_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Activity records are immutable'; END; $$;
REVOKE ALL ON FUNCTION private.prevent_activity_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER activity_immutable BEFORE UPDATE OR DELETE ON public.incident_activity FOR EACH ROW EXECUTE FUNCTION private.prevent_activity_mutation();
CREATE FUNCTION private.record_incident_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; entity uuid; kind text; fields text[]; field text; old_data jsonb; new_data jsonb; changes jsonb := '{}'::jsonb; metadata jsonb; caller uuid := auth.uid();
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required for activity recording' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'INSERT' THEN old_data := to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_data := to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='incidents' THEN
  target := NEW.id; entity := NEW.id;
  fields := ARRAY['title','description','severity','response_stage'];
  kind := CASE WHEN TG_OP='INSERT' THEN 'incident_created' ELSE 'incident_updated' END;
 ELSIF TG_TABLE_NAME='incident_affected_systems' THEN
  target := NEW.incident_id; entity := NEW.id;
  fields := ARRAY['resource_name','data_description','assessment','data_conditions','containment_status','investigation_notes'];
  kind := CASE WHEN TG_OP='INSERT' THEN 'system_created' ELSE 'system_updated' END;
 ELSIF TG_TABLE_NAME='incident_members' THEN
  target := coalesce(NEW.incident_id,OLD.incident_id); entity := coalesce(NEW.user_id,OLD.user_id);
  kind := CASE TG_OP WHEN 'INSERT' THEN 'member_added' WHEN 'DELETE' THEN 'member_removed' ELSE 'member_role_changed' END;
  IF TG_OP='UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NULL; END IF;
  metadata := jsonb_build_object('user_id',entity,'previous_role',old_data->'role','role',new_data->'role');
 ELSIF TG_TABLE_NAME='incident_messages' THEN
  target := NEW.incident_id; entity := NEW.id; kind := 'message_sent';
  metadata := jsonb_build_object('message_id',NEW.id,'sender_id',NEW.sender_id);
 ELSE RAISE EXCEPTION 'Unsupported activity source'; END IF;
 IF fields IS NOT NULL THEN
  FOREACH field IN ARRAY fields LOOP
   IF TG_OP='INSERT' THEN changes := changes || jsonb_build_object(field,jsonb_build_object('after',new_data->field));
   ELSIF old_data->field IS DISTINCT FROM new_data->field THEN changes := changes || jsonb_build_object(field,jsonb_build_object('before',old_data->field,'after',new_data->field)); END IF;
  END LOOP;
  IF TG_OP='UPDATE' AND changes='{}'::jsonb THEN RETURN NULL; END IF;
  metadata := jsonb_build_object('changes',changes);
 END IF;
 INSERT INTO public.incident_activity(incident_id,actor_id,actor_name,occurred_at,event_type,entity_id,details)
 VALUES(target,caller,left(coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'display_name'),''),nullif(btrim(auth.jwt()->'user_metadata'->>'full_name'),''),nullif(btrim(auth.jwt()->'user_metadata'->>'name'),'')),100),clock_timestamp(),kind,entity,metadata);
 RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION private.record_incident_activity() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER incident_activity_capture AFTER INSERT OR UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION private.record_incident_activity();
CREATE TRIGGER system_activity_capture AFTER INSERT OR UPDATE ON public.incident_affected_systems FOR EACH ROW EXECUTE FUNCTION private.record_incident_activity();
CREATE TRIGGER member_activity_capture AFTER INSERT OR UPDATE OR DELETE ON public.incident_members FOR EACH ROW EXECUTE FUNCTION private.record_incident_activity();
CREATE TRIGGER message_activity_capture AFTER INSERT ON public.incident_messages FOR EACH ROW EXECUTE FUNCTION private.record_incident_activity();
ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_activity;