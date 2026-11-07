CREATE TABLE public.incident_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL, author_name text, body text NOT NULL,
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(incident_id,sender_id,request_id)
);
GRANT SELECT ON public.incident_messages TO authenticated;
REVOKE ALL ON public.incident_messages FROM PUBLIC,anon,service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.incident_messages FROM authenticated;
ALTER TABLE public.incident_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY incident_messages_member_read ON public.incident_messages FOR SELECT TO authenticated USING(private.incident_role(incident_id) IS NOT NULL);
CREATE INDEX incident_messages_order_idx ON public.incident_messages(incident_id,created_at,id);
CREATE FUNCTION private.guard_incident_message() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Sent messages are immutable'; END IF;
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.incidents WHERE id=NEW.incident_id FOR UPDATE;
 IF private.incident_role(NEW.incident_id) IS NULL OR private.incident_role(NEW.incident_id) NOT IN ('commander','responder') THEN RAISE EXCEPTION 'Only commanders and responders can send messages' USING ERRCODE='42501'; END IF;
 NEW.body := regexp_replace(NEW.body,'^\s+|\s+$','','g');
 IF NEW.body IS NULL OR char_length(NEW.body) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Messages must contain 1 to 4000 characters' USING ERRCODE='22023'; END IF;
 NEW.sender_id := auth.uid(); NEW.created_at := clock_timestamp();
 NEW.author_name := left(coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'display_name'),''),nullif(btrim(auth.jwt()->'user_metadata'->>'full_name'),''),nullif(btrim(auth.jwt()->'user_metadata'->>'name'),'')),100);
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.guard_incident_message() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER incident_message_guard BEFORE INSERT OR UPDATE OR DELETE ON public.incident_messages FOR EACH ROW EXECUTE FUNCTION private.guard_incident_message();
CREATE FUNCTION public.send_incident_message(_incident_id uuid,_body text,_request_id uuid) RETURNS public.incident_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.incident_messages;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.incidents WHERE id=_incident_id FOR UPDATE;
 IF private.incident_role(_incident_id) IS NULL OR private.incident_role(_incident_id) NOT IN ('commander','responder') THEN RAISE EXCEPTION 'Only commanders and responders can send messages' USING ERRCODE='42501'; END IF;
 INSERT INTO public.incident_messages(incident_id,sender_id,body,request_id) VALUES(_incident_id,auth.uid(),_body,_request_id) ON CONFLICT(incident_id,sender_id,request_id) DO NOTHING RETURNING * INTO result;
 IF result.id IS NULL THEN SELECT * INTO result FROM public.incident_messages WHERE incident_id=_incident_id AND sender_id=auth.uid() AND request_id=_request_id; END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.send_incident_message(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.send_incident_message(uuid,text,uuid) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_members;