/*
  # Correct the Google Workspace email cost with real invoice numbers

  The earlier estimate (16.00 EUR, no due date) is replaced with the real
  figures from Wix invoice #1251282067 (16.20 EUR, next charge 2026-08-16).
  Delete-then-insert so this is safe to run whether or not the original
  migration (20260717110000) was already applied.
*/
delete from public.cost_items
  where vendor = 'Google Workspace' and item_name = '2x E-Mail-Postfach (liftpictures.com)';

insert into public.cost_items (vendor, vendor_purpose, payer, item_name, item_group, amount, currency, cycle, next_due_date, note, sort_order) values
  ('Google Workspace', 'E-Mail-Postfächer für liftpictures.com (abgerechnet über Wix)', 'Tom', '2x E-Mail-Postfach (liftpictures.com)', null, 16.20, 'EUR', 'monthly', '2026-08-16', 'Google Workspace Starter, Rechnung #1251282067 (Wix.com LTD), Zahlungsmethode Visa ...3507', 100);
