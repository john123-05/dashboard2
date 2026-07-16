/*
  # New Google Workspace email cost

  Two new liftpictures.com mailboxes were just set up via Google Workspace
  (tom@liftpictures.com, john@liftpictures.com), paid monthly by Tom - its
  own vendor group, distinct from the existing Microsoft 365/Domain Factory
  and IONOS email costs.
*/
insert into public.cost_items (vendor, vendor_purpose, payer, item_name, item_group, amount, currency, cycle, next_due_date, note, sort_order) values
  ('Google Workspace', 'E-Mail-Postfächer für liftpictures.com', 'Tom', '2x E-Mail-Postfach (liftpictures.com)', null, 16.00, 'EUR', 'monthly', null, 'tom@liftpictures.com, john@liftpictures.com — genaues Abrechnungsdatum noch nicht bekannt', 100);
