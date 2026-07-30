grant select
  on table public.customer_feedback_history
  to service_role;

grant select, insert
  on table public.feedback_summary_runs
  to service_role;
