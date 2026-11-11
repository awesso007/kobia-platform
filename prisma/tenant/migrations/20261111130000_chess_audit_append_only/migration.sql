-- Prevent ordinary updates or deletions of CHESS audit-event rows.
-- DB superusers / schema owners can alter triggers; configure production DB
-- roles so the application cannot DROP TRIGGER or modify this function.
CREATE FUNCTION "chess_reject_security_event_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CHESS audit events are append-only';
END;
$$;
CREATE TRIGGER "chess_security_event_immutable"
BEFORE UPDATE OR DELETE ON "ChessSecurityEvent"
FOR EACH ROW EXECUTE FUNCTION "chess_reject_security_event_mutation"();
