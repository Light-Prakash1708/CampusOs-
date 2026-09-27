ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_ck" CHECK ("plan" IN ('PILOT', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_status_ck" CHECK ("status" IN ('PILOT', 'ACTIVE', 'PAST_DUE', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_money_ck" CHECK ("seats" >= 0 AND "price_per_seat_paise" >= 0 AND "period_end" > "period_start");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_ck" CHECK ("status" IN ('ISSUED', 'PAID', 'VOID'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_money_ck" CHECK ("subtotal_paise" >= 0 AND "tax_paise" >= 0 AND "total_paise" = "subtotal_paise" + "tax_paise");
