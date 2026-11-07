CREATE TABLE public.incident_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
 role public.incident_member_role NOT NULL, issuer_id uuid NOT NULL, token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, redeemed_at timestamptz, redeemed_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id, incident_id, role, issuer_id, expires_at, redeemed_at, redeemed_by, created_at, updated_at) ON public.incident_invitations TO authenticated;
REVOKE ALL ON public.incident_invitations FROM PUBLIC, anon;
ALTER TABLE public.incident_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_commander_read ON public.incident_invitations FOR SELECT TO authenticated USING (private.incident_role(incident_id) = 'commander');
CREATE FUNCTION private.validate_incident_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.role NOT IN ('responder','viewer') OR NEW.token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
 IF TG_OP = 'INSERT' AND (NEW.expires_at <= now() OR NEW.expires_at > now() + interval '24 hours') THEN RAISE EXCEPTION 'Invalid invitation expiry'; END IF;
 NEW.updated_at := now(); RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.validate_incident_invitation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invitation_validate BEFORE INSERT OR UPDATE ON public.incident_invitations FOR EACH ROW EXECUTE FUNCTION private.validate_incident_invitation();
CREATE FUNCTION public.issue_incident_invitation(_incident_id uuid, _role public.incident_member_role, _token_hash text) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); expiry timestamptz := now() + interval '24 hours';
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 PERFORM 1 FROM public.incidents WHERE id=_incident_id FOR UPDATE;
 IF private.incident_role(_incident_id) IS DISTINCT FROM 'commander'::public.incident_member_role THEN RAISE EXCEPTION 'Only commanders can invite' USING ERRCODE = '42501'; END IF;
 INSERT INTO public.incident_invitations(incident_id, role, issuer_id, token_hash, expires_at) VALUES (_incident_id, _role, caller, _token_hash, expiry);
 RETURN expiry;
END; $$;
REVOKE ALL ON FUNCTION public.issue_incident_invitation(uuid, public.incident_member_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_incident_invitation(uuid, public.incident_member_role, text) TO authenticated;
CREATE FUNCTION public.redeem_incident_invitation(_token_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); invitation public.incident_invitations; target uuid;
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 SELECT incident_id INTO target FROM public.incident_invitations WHERE token_hash=_token_hash;
 IF target IS NULL THEN RAISE EXCEPTION 'Invitation is invalid or unavailable'; END IF;
 PERFORM 1 FROM public.incidents WHERE id=target FOR UPDATE;
 SELECT * INTO invitation FROM public.incident_invitations WHERE token_hash=_token_hash FOR UPDATE;
 IF invitation.id IS NULL OR invitation.redeemed_at IS NOT NULL OR invitation.expires_at <= clock_timestamp() OR NOT EXISTS (SELECT 1 FROM public.incident_members WHERE incident_id=target AND user_id=invitation.issuer_id AND role='commander') THEN RAISE EXCEPTION 'Invitation is invalid or unavailable'; END IF;
 INSERT INTO public.incident_members(incident_id, user_id, role) VALUES (target, caller, invitation.role) ON CONFLICT (incident_id, user_id) DO NOTHING;
 UPDATE public.incident_invitations SET redeemed_at=clock_timestamp(), redeemed_by=caller WHERE id=invitation.id;
 RETURN target;
END; $$;
REVOKE ALL ON FUNCTION public.redeem_incident_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_incident_invitation(text) TO authenticated;