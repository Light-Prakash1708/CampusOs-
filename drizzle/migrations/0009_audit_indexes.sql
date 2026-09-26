CREATE INDEX "resources_file_url_idx" ON "resources" USING btree ("file_url");--> statement-breakpoint
CREATE INDEX "event_certificates_event_idx" ON "event_certificates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "library_loans_desk_idx" ON "library_loans" USING btree ("institution_id","returned_at","due_at");--> statement-breakpoint
CREATE INDEX "library_reservations_inst_idx" ON "library_reservations" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "resource_saves_resource_idx" ON "resource_saves" USING btree ("resource_id");