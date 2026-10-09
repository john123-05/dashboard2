-- Sales whose payment the agent could only match by time window (no payment
-- flag in Statistic.txt) arrive with method_source = 'zeitfenster'. The check
-- did not allow it, so liftpic-status silently lost every such sale - all of
-- Plose's and Gruenberg's. Project: kvpcwlcfgmsmarjtwpsx.
alter table public.machine_sale_payments
  drop constraint machine_sale_payments_method_source_check;

alter table public.machine_sale_payments
  add constraint machine_sale_payments_method_source_check
  check (method_source = any (array[
    'automat_flag',
    'automat_flag_ohne_beleg',
    'beleg_ohne_verkaufszeile',
    'kein_flag',
    'zeitfenster'
  ]));
