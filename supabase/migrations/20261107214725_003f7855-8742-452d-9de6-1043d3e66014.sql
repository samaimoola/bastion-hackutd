CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE TYPE public.incident_severity AS ENUM ('Critical', 'High', 'Medium', 'Low');
CREATE TYPE public.incident_response_stage AS ENUM ('Detection', 'Containment', 'Eradication', 'Recovery', 'Post-incident');
CREATE TYPE public.incident_member_role AS ENUM ('commander', 'responder', 'viewer');
CREATE TABLE public.incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL DEFAULT '',
 severity public.incident_severity NOT NULL DEFAULT 'Medium', response_stage public.incident_response_stage NOT NULL DEFAULT 'Detection',
 creator_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.incidents TO authenticated;
REVOKE ALL ON public.incidents FROM anon;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.incident_members (
 incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, role public.incident_member_role NOT NULL, PRIMARY KEY (incident_id, user_id)
);
GRANT SELECT ON public.incident_members TO authenticated;
REVOKE ALL ON public.incident_members FROM anon;
ALTER TABLE public.incident_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX incident_members_user_incident_idx ON public.incident_members(user_id, incident_id);
CREATE FUNCTION private.incident_role(_incident_id uuid)
RETURNS public.incident_member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT m.role FROM public.incident_members m WHERE m.incident_id = _incident_id AND m.user_id = (SELECT auth.uid()) AND (SELECT auth.role()) = 'authenticated'
$$;
REVOKE ALL ON FUNCTION private.incident_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.incident_role(uuid) TO authenticated;
CREATE POLICY incidents_member_read ON public.incidents FOR SELECT TO authenticated USING (private.incident_role(id) IS NOT NULL);
CREATE POLICY incident_members_member_read ON public.incident_members FOR SELECT TO authenticated USING (private.incident_role(incident_id) IS NOT NULL);
CREATE FUNCTION private.validate_incident() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF length(btrim(NEW.title)) = 0 THEN RAISE EXCEPTION 'Incident title is required' USING ERRCODE = '22023'; END IF;
 IF TG_OP = 'UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.creator_id IS DISTINCT FROM OLD.creator_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Incident identity and creation fields are immutable' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := clock_timestamp();
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_incident() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER incident_validate BEFORE INSERT OR UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION private.validate_incident();
CREATE FUNCTION private.guard_incident_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_incident uuid;
BEGIN
 IF TG_OP = 'UPDATE' AND (NEW.incident_id IS DISTINCT FROM OLD.incident_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
  RAISE EXCEPTION 'Membership identity is immutable' USING ERRCODE = '42501';
 END IF;
 IF TG_OP = 'DELETE' THEN target_incident := OLD.incident_id; ELSE target_incident := NEW.incident_id; END IF;
 UPDATE public.incidents SET updated_at = updated_at WHERE id = target_incident;
 IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id) THEN
  RAISE EXCEPTION 'Member must be an existing authenticated user' USING ERRCODE = '23503';
 END IF;
 IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
  IF OLD.role = 'commander' THEN
   IF TG_OP = 'DELETE' OR NEW.role <> 'commander' THEN
    IF EXISTS (SELECT 1 FROM public.incidents WHERE id = target_incident)
     AND NOT EXISTS (SELECT 1 FROM public.incident_members WHERE incident_id = target_incident AND role = 'commander' AND user_id <> OLD.user_id) THEN
     RAISE EXCEPTION 'Cannot remove or demote the last commander' USING ERRCODE = '23514';
    END IF;
   END IF;
  END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_incident_membership() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER incident_members_guard BEFORE INSERT OR UPDATE OR DELETE ON public.incident_members FOR EACH ROW EXECUTE FUNCTION private.guard_incident_membership();
CREATE FUNCTION public.create_incident(_title text, _description text DEFAULT '', _severity public.incident_severity DEFAULT 'Medium', _response_stage public.incident_response_stage DEFAULT 'Detection')
RETURNS public.incidents LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); created public.incidents;
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 INSERT INTO public.incidents(title, description, severity, response_stage, creator_id) VALUES (btrim(_title), _description, _severity, _response_stage, caller) RETURNING * INTO created;
 INSERT INTO public.incident_members(incident_id, user_id, role) VALUES (created.id, caller, 'commander');
 SELECT * INTO created FROM public.incidents WHERE id = created.id;
 RETURN created;
END;
$$;
REVOKE ALL ON FUNCTION public.create_incident(text, text, public.incident_severity, public.incident_response_stage) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_incident(text, text, public.incident_severity, public.incident_response_stage) TO authenticated;
CREATE FUNCTION public.set_incident_member(_incident_id uuid, _user_id uuid, _role public.incident_member_role)
RETURNS public.incident_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); member public.incident_members;
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 UPDATE public.incidents SET updated_at = updated_at WHERE id = _incident_id;
 IF private.incident_role(_incident_id) IS DISTINCT FROM 'commander'::public.incident_member_role THEN RAISE EXCEPTION 'Only commanders can manage membership' USING ERRCODE = '42501'; END IF;
 INSERT INTO public.incident_members(incident_id, user_id, role) VALUES (_incident_id, _user_id, _role)
 ON CONFLICT (incident_id, user_id) DO UPDATE SET role = EXCLUDED.role RETURNING * INTO member;
 RETURN member;
END;
$$;
REVOKE ALL ON FUNCTION public.set_incident_member(uuid, uuid, public.incident_member_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_incident_member(uuid, uuid, public.incident_member_role) TO authenticated;
CREATE FUNCTION public.remove_incident_member(_incident_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid();
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 UPDATE public.incidents SET updated_at = updated_at WHERE id = _incident_id;
 IF private.incident_role(_incident_id) IS DISTINCT FROM 'commander'::public.incident_member_role THEN RAISE EXCEPTION 'Only commanders can manage membership' USING ERRCODE = '42501'; END IF;
 DELETE FROM public.incident_members WHERE incident_id = _incident_id AND user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_incident_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_incident_member(uuid, uuid) TO authenticated;
CREATE FUNCTION public.update_incident_details(_incident_id uuid, _title text, _description text, _severity public.incident_severity, _response_stage public.incident_response_stage)
RETURNS public.incidents LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); changed public.incidents;
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 UPDATE public.incidents SET updated_at = updated_at WHERE id = _incident_id;
 IF private.incident_role(_incident_id) IS NULL OR private.incident_role(_incident_id) NOT IN ('commander', 'responder') THEN RAISE EXCEPTION 'Only commanders and responders can edit incidents' USING ERRCODE = '42501'; END IF;
 UPDATE public.incidents SET title = btrim(_title), description = _description, severity = _severity, response_stage = _response_stage WHERE id = _incident_id RETURNING * INTO changed;
 RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.update_incident_details(uuid, text, text, public.incident_severity, public.incident_response_stage) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_incident_details(uuid, text, text, public.incident_severity, public.incident_response_stage) TO authenticated;