-- Source ChessSecurityEvent is already write-once via its own migration.
-- Do not let the application rewrite or delete a confirmed remote receipt.
CREATE FUNCTION chess_prevent_archived_audit_receipt_changes()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'ARCHIVED' THEN
    RAISE EXCEPTION 'Archived security evidence is immutable';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chess_audit_archive_receipt_write_once
BEFORE UPDATE OR DELETE ON "ChessAuditArchiveOutbox"
FOR EACH ROW EXECUTE FUNCTION chess_prevent_archived_audit_receipt_changes();
