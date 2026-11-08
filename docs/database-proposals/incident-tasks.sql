-- PROPOSAL ONLY: NOT APPLIED. Shared incident tasks for Bastion.
-- This file is deliberately outside supabase/migrations/. Repository rules reserve schema changes for
-- Lovable, so apply it through Lovable (or the Supabase SQL editor by an administrator), then regenerate
-- src/integrations/supabase/types.ts. See docs/database-proposals/incident-tasks.md.
--
-- Follows the existing architecture: member-only reads through RLS, no direct client writes, writes only
-- through SECURITY DEFINER RPCs that lock the parent incident first, trusted actors and timestamps set in
-- a BEFORE trigger, activity recorded atomically by the existing AFTER trigger, and Realtime publication.

CREATE TABLE public.incident_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
 title text NOT NULL,
 details text NOT NULL DEFAULT '',
 assignee_id uuid,
 status text NOT NULL DEFAULT 'todo',
 created_by uuid NOT NULL, updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.incident_tasks TO authenticated;
REVOKE ALL ON public.incident_tasks FROM PUBLIC, anon, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.incident_tasks FROM authenticated;
ALTER TABLE public.incident_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY incident_task_member_read ON public.incident_tasks FOR SELECT TO authenticated USING (private.incident_role(incident_id) IS NOT NULL);
CREATE INDEX incident_task_incident_idx ON public.incident_tasks(incident_id, created_at, id);

-- Validation, trusted actors/times and assignee eligibility (assignee must be a current member).
CREATE FUNCTION private.validate_incident_task() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Tasks cannot be deleted' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.incident_id IS DISTINCT FROM OLD.incident_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
  RAISE EXCEPTION 'Task identity and creation fields are immutable' USING ERRCODE='42501';
 END IF;
 NEW.title := btrim(NEW.title);
 IF NEW.title IS NULL OR char_length(NEW.title) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Task titles must be 1 to 200 characters' USING ERRCODE='22023'; END IF;
 NEW.details := coalesce(NEW.details, '');
 IF char_length(NEW.details) > 10000 THEN RAISE EXCEPTION 'Task details can be up to 10000 characters' USING ERRCODE='22023'; END IF;
 IF NEW.status NOT IN ('todo','in_progress','done') THEN RAISE EXCEPTION 'Invalid task status' USING ERRCODE='22023'; END IF;
 IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.incident_members m WHERE m.incident_id = NEW.incident_id AND m.user_id = NEW.assignee_id) THEN
  RAISE EXCEPTION 'The assignee must be a current member of this incident' USING ERRCODE='23503';
 END IF;
 IF TG_OP='INSERT' THEN NEW.created_by := auth.uid(); NEW.created_at := clock_timestamp(); END IF;
 NEW.updated_by := auth.uid(); NEW.updated_at := clock_timestamp();
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.validate_incident_task() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER incident_task_validate BEFORE INSERT OR UPDATE OR DELETE ON public.incident_tasks FOR EACH ROW EXECUTE FUNCTION private.validate_incident_task();

CREATE FUNCTION public.add_incident_task(_incident_id uuid, _title text, _details text, _assignee_id uuid) RETURNS public.incident_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.incident_tasks;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.incidents WHERE id=_incident_id FOR UPDATE;
 IF private.incident_role(_incident_id) IS NULL OR private.incident_role(_incident_id) NOT IN ('commander','responder') THEN RAISE EXCEPTION 'Only commanders and responders can edit tasks' USING ERRCODE='42501'; END IF;
 INSERT INTO public.incident_tasks(incident_id, title, details, assignee_id, status, created_by, updated_by)
 VALUES (_incident_id, _title, coalesce(_details, ''), _assignee_id, 'todo', auth.uid(), auth.uid()) RETURNING * INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.add_incident_task(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_incident_task(uuid, text, text, uuid) TO authenticated;

CREATE FUNCTION public.update_incident_task(_id uuid, _title text, _details text, _assignee_id uuid, _status text) RETURNS public.incident_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; result public.incident_tasks;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT incident_id INTO target FROM public.incident_tasks WHERE id=_id;
 PERFORM 1 FROM public.incidents WHERE id=target FOR UPDATE;
 IF target IS NULL OR private.incident_role(target) IS NULL OR private.incident_role(target) NOT IN ('commander','responder') THEN RAISE EXCEPTION 'Only commanders and responders can edit tasks' USING ERRCODE='42501'; END IF;
 UPDATE public.incident_tasks SET title=_title, details=coalesce(_details, ''), assignee_id=_assignee_id, status=_status WHERE id=_id RETURNING * INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.update_incident_task(uuid, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_incident_task(uuid, text, text, uuid, text) TO authenticated;

-- When someone loses access, their open assignments are cleared in the same transaction (and audited).
CREATE FUNCTION private.unassign_removed_member_tasks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.incident_tasks SET assignee_id = NULL WHERE incident_id = OLD.incident_id AND assignee_id = OLD.user_id;
 RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION private.unassign_removed_member_tasks() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER incident_member_task_cleanup AFTER DELETE ON public.incident_members FOR EACH ROW EXECUTE FUNCTION private.unassign_removed_member_tasks();

-- Existing activity recorder, unchanged except for the new incident_tasks branch (field allowlist).
CREATE OR REPLACE FUNCTION private.record_incident_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 ELSIF TG_TABLE_NAME='incident_tasks' THEN
  target := NEW.incident_id; entity := NEW.id;
  fields := ARRAY['title','details','assignee_id','status'];
  kind := CASE WHEN TG_OP='INSERT' THEN 'task_created' ELSE 'task_updated' END;
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
CREATE TRIGGER task_activity_capture AFTER INSERT OR UPDATE ON public.incident_tasks FOR EACH ROW EXECUTE FUNCTION private.record_incident_activity();

ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_tasks;
