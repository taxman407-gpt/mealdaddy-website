alter table public.optional_diagnostic_events drop constraint optional_diagnostic_events_feature_check;
alter table public.optional_diagnostic_events add constraint optional_diagnostic_events_feature_check check(feature in ('estimate-entry','analyze-saved-food','adjust-leftovers','coach-action','recipe-recreation'));
