-- PROPOSAL ONLY: NOT APPLIED. Invitation-only account creation for Bastion.
-- This file is deliberately outside supabase/migrations/. Repository rules reserve schema changes for
-- Lovable, so apply it through Lovable (or the Supabase SQL editor by an administrator), then regenerate
-- src/integrations/supabase/types.ts. See docs/database-proposals/signup-invitations.md for the full
-- deployment order. Public sign-up must stay disabled until every step there is done.
--
-- Two layers enforce the invitation; the browser enforces nothing:
--  1. public.bastion_before_user_created: a Supabase Auth "Before User Created" hook. Auth calls it for
--     every self-service creation path (email/phone sign-up, magic link, OAuth, anonymous, admin invite)
--     but not for administrator "Create new user" (admin createUser), so dashboard provisioning keeps
--     working. It rejects any creation without a usable invitation for that exact email.
--  2. Triggers on auth.users, in the same transaction as the insert: when the new user's metadata carries
--     an invitation code, lock the incident and the invitation row, re-check everything, mark it redeemed,
--     strip the code from the stored metadata and add exactly the invited role to exactly that incident.
--     Any failure aborts the account creation. Inserts with no code (administrator-created accounts) are
--     left alone, exactly as today.
-- Only a SHA-256 hash of the code is stored. A single switch (private.signup_settings.enabled) gates
-- issuing, the hook and redemption, and doubles as an emergency off switch.

CREATE TABLE private.signup_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.signup_settings DEFAULT VALUES;
REVOKE ALL ON private.signup_settings FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.signup_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
 issuer_id uuid NOT NULL,
 email text NOT NULL,
 role public.incident_member_role NOT NULL,
 code_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 redeemed_at timestamptz,
 redeemed_by uuid,
 CONSTRAINT signup_invitation_role CHECK (role IN ('responder', 'viewer')),
 CONSTRAINT signup_invitation_hash CHECK (code_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT signup_invitation_email CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
 CONSTRAINT signup_invitation_redemption CHECK ((redeemed_at IS NULL) = (redeemed_by IS NULL))
);
CREATE UNIQUE INDEX signup_invitation_redeemed_by_idx ON public.signup_invitations(redeemed_by) WHERE redeemed_by IS NOT NULL;
-- No client, anonymous or service-role access at all: only the SECURITY DEFINER functions below touch it.
REVOKE ALL ON public.signup_invitations FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.signup_invitations ENABLE ROW LEVEL SECURITY;

-- Lets the sign-up page decide between the form and a "not set up yet" message. Reveals nothing else.
CREATE FUNCTION public.invitation_signup_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce((SELECT s.enabled FROM private.signup_settings s WHERE s.singleton), false)
$$;
REVOKE ALL ON FUNCTION public.invitation_signup_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_signup_ready() TO anon, authenticated;

-- 32 lowercase hex characters (128 random bits) -> SHA-256 hex, or NULL when malformed.
CREATE FUNCTION private.signup_code_hash(_code text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE WHEN lower(btrim(_code)) ~ '^[0-9a-f]{32}$' THEN encode(sha256(convert_to(lower(btrim(_code)), 'UTF8')), 'hex') END
$$;
-- Every condition for using an invitation, shared by the hook and the redemption trigger.
CREATE FUNCTION private.signup_invitation_usable(_invitation public.signup_invitations, _email text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.invitation_signup_ready()
  AND _invitation.id IS NOT NULL
  AND _invitation.redeemed_at IS NULL
  AND _invitation.expires_at > clock_timestamp()
  AND _invitation.email = lower(btrim(_email))
  AND EXISTS (SELECT 1 FROM public.incident_members m WHERE m.incident_id = _invitation.incident_id AND m.user_id = _invitation.issuer_id AND m.role = 'commander')
$$;
REVOKE ALL ON FUNCTION private.signup_code_hash(text), private.signup_invitation_usable(public.signup_invitations, text) FROM PUBLIC, anon, authenticated, service_role;

-- Commander-only. The server generates the code and sends only its hash; the code itself is never stored.
CREATE FUNCTION public.issue_signup_invitation(_incident_id uuid, _email text, _role public.incident_member_role, _code_hash text) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); normalized text := lower(btrim(_email)); expiry timestamptz := clock_timestamp() + interval '24 hours';
BEGIN
 IF caller IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 IF NOT public.invitation_signup_ready() THEN RAISE EXCEPTION 'Account invitations are not set up yet' USING ERRCODE = '55000'; END IF;
 PERFORM 1 FROM public.incidents WHERE id = _incident_id FOR UPDATE;
 IF NOT FOUND OR private.incident_role(_incident_id) IS DISTINCT FROM 'commander'::public.incident_member_role THEN
  RAISE EXCEPTION 'Only commanders can invite new accounts' USING ERRCODE = '42501';
 END IF;
 IF normalized IS NULL OR char_length(normalized) > 254 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
 END IF;
 IF _role IS NULL OR _role NOT IN ('responder', 'viewer') THEN RAISE EXCEPTION 'New accounts can be invited as responder or viewer only' USING ERRCODE = '22023'; END IF;
 IF _code_hash IS NULL OR _code_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE = '22023'; END IF;
 INSERT INTO public.signup_invitations(incident_id, issuer_id, email, role, code_hash, expires_at) VALUES (_incident_id, caller, normalized, _role, _code_hash, expiry);
 RETURN expiry;
END; $$;
REVOKE ALL ON FUNCTION public.issue_signup_invitation(uuid, text, public.incident_member_role, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.issue_signup_invitation(uuid, text, public.incident_member_role, text) TO authenticated;

-- Layer 1: Supabase Auth "Before User Created" hook (Postgres function). Configure it in the dashboard
-- under Authentication -> Hooks. Returns {} to allow, or an error object (HTTP 403) to refuse.
CREATE FUNCTION public.bastion_before_user_created(event jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE digest text := private.signup_code_hash(event->'user'->'user_metadata'->>'invitation_code'); invitation public.signup_invitations;
BEGIN
 IF digest IS NOT NULL AND coalesce((event->'user'->>'is_anonymous')::boolean, false) = false THEN
  SELECT * INTO invitation FROM public.signup_invitations WHERE code_hash = digest;
  IF private.signup_invitation_usable(invitation, event->'user'->>'email') THEN RETURN '{}'::jsonb; END IF;
 END IF;
 RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403,
  'message', 'A valid, unused Bastion invitation for this email address is required to create an account.'));
END; $$;
REVOKE ALL ON FUNCTION public.bastion_before_user_created(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bastion_before_user_created(jsonb) TO supabase_auth_admin;

-- Layer 2a: redeem atomically with the user insert. Lock order (incident, then invitation) matches the
-- other access-changing functions, so concurrent redemptions of one code serialize and only one wins.
CREATE FUNCTION private.redeem_signup_invitation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE digest text; target uuid; invitation public.signup_invitations; updated int;
BEGIN
 IF NEW.raw_user_meta_data IS NULL OR NOT (NEW.raw_user_meta_data ? 'invitation_code') THEN RETURN NEW; END IF;
 digest := private.signup_code_hash(NEW.raw_user_meta_data->>'invitation_code');
 IF digest IS NOT NULL THEN SELECT incident_id INTO target FROM public.signup_invitations WHERE code_hash = digest; END IF;
 IF target IS NOT NULL THEN
  PERFORM 1 FROM public.incidents WHERE id = target FOR UPDATE;
  SELECT * INTO invitation FROM public.signup_invitations WHERE code_hash = digest FOR UPDATE;
 END IF;
 IF target IS NULL OR NOT private.signup_invitation_usable(invitation, NEW.email) THEN
  RAISE EXCEPTION 'A valid, unused Bastion invitation for this email address is required' USING ERRCODE = '42501';
 END IF;
 UPDATE public.signup_invitations SET redeemed_at = clock_timestamp(), redeemed_by = NEW.id WHERE id = invitation.id AND redeemed_at IS NULL;
 GET DIAGNOSTICS updated = ROW_COUNT;
 IF updated <> 1 THEN RAISE EXCEPTION 'A valid, unused Bastion invitation for this email address is required' USING ERRCODE = '42501'; END IF;
 NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'invitation_code';
 RETURN NEW;
END; $$;

-- Layer 2b: grant exactly the invited role on exactly the invited incident. The existing membership guard
-- and activity log require a signed-in actor; during sign-up there is none, so the issuing commander is
-- recorded as the actor (they authorised the access) for this one insert, then the settings are restored.
CREATE FUNCTION private.assign_signup_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invitation public.signup_invitations; saved_sub text; saved_role text; saved_claims text;
BEGIN
 SELECT * INTO invitation FROM public.signup_invitations WHERE redeemed_by = NEW.id;
 IF invitation.id IS NULL THEN RETURN NULL; END IF;
 saved_sub := current_setting('request.jwt.claim.sub', true);
 saved_role := current_setting('request.jwt.claim.role', true);
 saved_claims := current_setting('request.jwt.claims', true);
 PERFORM set_config('request.jwt.claim.sub', invitation.issuer_id::text, true);
 PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
 PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', invitation.issuer_id, 'role', 'authenticated')::text, true);
 INSERT INTO public.incident_members(incident_id, user_id, role) VALUES (invitation.incident_id, NEW.id, invitation.role);
 PERFORM set_config('request.jwt.claim.sub', coalesce(saved_sub, ''), true);
 PERFORM set_config('request.jwt.claim.role', coalesce(saved_role, ''), true);
 PERFORM set_config('request.jwt.claims', coalesce(saved_claims, ''), true);
 RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION private.redeem_signup_invitation(), private.assign_signup_membership() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER bastion_signup_invitation_redeem BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.redeem_signup_invitation();
CREATE TRIGGER bastion_signup_invitation_membership AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.assign_signup_membership();
