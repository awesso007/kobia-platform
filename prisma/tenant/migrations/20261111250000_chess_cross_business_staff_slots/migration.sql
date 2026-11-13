-- One staff member may be assigned across multiple business units in a
-- single CHESS tenant, but must not be double-booked. No cross-business
-- appointment details are exposed to the employee/manager receiving a 409.
-- Cross-TENANT scheduling remains out of scope by design.
ALTER TABLE "ChessAppointment" DROP CONSTRAINT "ChessAppointment_no_staff_overlap";
ALTER TABLE "ChessAppointment"
 ADD CONSTRAINT "ChessAppointment_no_staff_overlap" EXCLUDE USING gist (
  "assignedClerkUserId" WITH =,
  tsrange("startAt","endAt",'[)') WITH &&
 ) WHERE ("status"='SCHEDULED');
