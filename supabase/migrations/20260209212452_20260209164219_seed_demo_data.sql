/*
  # Seed Demo Data for Liftpictures Operator Dashboard

  Populates the database with realistic demo data for development and testing.

  1. Organizations
    - Alpine Adventures Group (demo org)

  2. Parks
    - Summit Peak Resort (Colorado)
    - Crystal Lake Park (Utah)

  3. Attractions
    - Eagle Gondola, Thunder Rapids (Summit Peak)
    - Sky Bridge Walk, Crystal Coaster (Crystal Lake)

  4. Sample Data
    - 40 customers with varied profiles
    - ~200 photos distributed across attractions over 30 days
    - ~80 purchases with realistic pricing
    - 25 marketing leads
    - 8 support tickets
    - 20 system health events

  5. Notes
    - Uses generate_series for date-distributed data
    - All monetary values in USD cents
    - Photo URLs use Pexels stock images
*/

DO $$
DECLARE
  org_id uuid;
  park1_id uuid;
  park2_id uuid;
  attr1_id uuid;
  attr2_id uuid;
  attr3_id uuid;
  attr4_id uuid;
  cust_ids uuid[];
  photo_ids uuid[];
  temp_id uuid;
  i integer;
  rand_attr uuid;
  rand_cust uuid;
  rand_photo uuid;
  attrs uuid[];
  first_names text[] := ARRAY['Emma','Liam','Olivia','Noah','Ava','James','Sophia','Oliver','Isabella','William','Mia','Benjamin','Charlotte','Elijah','Amelia','Lucas','Harper','Mason','Evelyn','Logan','Abigail','Alexander','Emily','Ethan','Ella','Jacob','Elizabeth','Michael','Camila','Daniel','Grace','Henry','Sofia','Jackson','Scarlett','Sebastian','Victoria','Aiden','Aria','Matthew'];
  last_names text[] := ARRAY['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson'];
  sources text[] := ARRAY['website','kiosk','qr_code','social_media','referral','email_campaign'];
  event_types text[] := ARRAY['webhook_received','api_call','camera_sync','payment_processed','photo_upload','service_restart','error_logged'];
BEGIN
  -- Create organization
  INSERT INTO organizations (name, slug, logo_url)
  VALUES ('Alpine Adventures Group', 'alpine-adventures', null)
  RETURNING id INTO org_id;

  -- Create parks
  INSERT INTO parks (organization_id, name, slug, location, timezone)
  VALUES (org_id, 'Summit Peak Resort', 'summit-peak', 'Aspen, Colorado', 'America/Denver')
  RETURNING id INTO park1_id;

  INSERT INTO parks (organization_id, name, slug, location, timezone)
  VALUES (org_id, 'Crystal Lake Park', 'crystal-lake', 'Park City, Utah', 'America/Denver')
  RETURNING id INTO park2_id;

  -- Create attractions
  INSERT INTO attractions (park_id, name, type, status)
  VALUES (park1_id, 'Eagle Gondola', 'gondola', 'active')
  RETURNING id INTO attr1_id;

  INSERT INTO attractions (park_id, name, type, status)
  VALUES (park1_id, 'Thunder Rapids', 'ride', 'active')
  RETURNING id INTO attr2_id;

  INSERT INTO attractions (park_id, name, type, status)
  VALUES (park2_id, 'Sky Bridge Walk', 'walk', 'active')
  RETURNING id INTO attr3_id;

  INSERT INTO attractions (park_id, name, type, status)
  VALUES (park2_id, 'Crystal Coaster', 'coaster', 'maintenance')
  RETURNING id INTO attr4_id;

  attrs := ARRAY[attr1_id, attr2_id, attr3_id, attr4_id];

  -- Create 40 customers
  cust_ids := ARRAY[]::uuid[];
  FOR i IN 1..40 LOOP
    INSERT INTO customers (email, full_name, phone, opted_in_marketing, created_at)
    VALUES (
      lower(first_names[i]) || '.' || lower(last_names[((i * 7) % 30) + 1]) || '@example.com',
      first_names[i] || ' ' || last_names[((i * 7) % 30) + 1],
      '+1555' || lpad((1000000 + floor(random() * 8999999))::text, 7, '0'),
      random() > 0.6,
      now() - (floor(random() * 90) || ' days')::interval
    )
    RETURNING id INTO temp_id;
    cust_ids := cust_ids || temp_id;
  END LOOP;

  -- Create ~200 photos across attractions over 30 days
  photo_ids := ARRAY[]::uuid[];
  FOR i IN 1..200 LOOP
    rand_attr := attrs[1 + floor(random() * 4)::int];
    rand_cust := cust_ids[1 + floor(random() * 40)::int];

    INSERT INTO photos (attraction_id, customer_id, image_url, thumbnail_url, taken_at, status)
    VALUES (
      rand_attr,
      CASE WHEN random() > 0.15 THEN rand_cust ELSE NULL END,
      'https://images.pexels.com/photos/' ||
        (ARRAY[417074,691668,1054218,1308881,1366909,1576937,2325446,2387873,2559941,2662116,3225517,3408744,3551227,3617500,3889843,4215113,4534200,5472308,6044198,7031406])[1 + floor(random() * 20)::int] ||
        '/pexels-photo.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/' ||
        (ARRAY[417074,691668,1054218,1308881,1366909,1576937,2325446,2387873,2559941,2662116,3225517,3408744,3551227,3617500,3889843,4215113,4534200,5472308,6044198,7031406])[1 + floor(random() * 20)::int] ||
        '/pexels-photo.jpeg?auto=compress&cs=tinysrgb&w=200',
      now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval,
      CASE
        WHEN random() > 0.6 THEN 'purchased'
        WHEN random() > 0.1 THEN 'available'
        ELSE 'expired'
      END
    )
    RETURNING id INTO temp_id;
    photo_ids := photo_ids || temp_id;
  END LOOP;

  -- Create ~80 purchases
  FOR i IN 1..80 LOOP
    rand_photo := photo_ids[1 + floor(random() * array_length(photo_ids, 1))::int];
    rand_cust := cust_ids[1 + floor(random() * 40)::int];

    INSERT INTO purchases (photo_id, customer_id, amount_cents, currency, stripe_payment_id, status, purchased_at)
    VALUES (
      rand_photo,
      rand_cust,
      (ARRAY[999, 1499, 1999, 2499, 2999, 3499])[1 + floor(random() * 6)::int],
      'usd',
      'pi_' || encode(gen_random_bytes(12), 'hex'),
      CASE
        WHEN random() > 0.92 THEN 'refunded'
        WHEN random() > 0.85 THEN 'pending'
        ELSE 'completed'
      END,
      now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Create 25 leads
  FOR i IN 1..25 LOOP
    INSERT INTO leads (park_id, email, full_name, source, opted_in, created_at)
    VALUES (
      CASE WHEN random() > 0.45 THEN park1_id ELSE park2_id END,
      'lead' || i || '@example.com',
      first_names[((i * 3) % 40) + 1] || ' ' || last_names[((i * 5) % 30) + 1],
      sources[1 + floor(random() * 6)::int],
      random() > 0.35,
      now() - (floor(random() * 30) || ' days')::interval
    );
  END LOOP;

  -- Create 8 support tickets (using a placeholder operator id since no real operator exists yet)
  -- These will be viewable once an operator joins the org

  -- Create 20 system health events
  FOR i IN 1..20 LOOP
    INSERT INTO system_health_events (park_id, event_type, severity, message, metadata, created_at)
    VALUES (
      CASE WHEN random() > 0.5 THEN park1_id ELSE park2_id END,
      event_types[1 + floor(random() * 7)::int],
      CASE
        WHEN random() > 0.9 THEN 'critical'
        WHEN random() > 0.7 THEN 'error'
        WHEN random() > 0.4 THEN 'warning'
        ELSE 'info'
      END,
      CASE event_types[1 + floor(random() * 7)::int]
        WHEN 'webhook_received' THEN 'Stripe webhook processed successfully'
        WHEN 'api_call' THEN 'External API response time: ' || (50 + floor(random() * 450))::text || 'ms'
        WHEN 'camera_sync' THEN 'Camera ' || (1 + floor(random() * 8))::text || ' synced ' || (10 + floor(random() * 90))::text || ' photos'
        WHEN 'payment_processed' THEN 'Payment of $' || (9.99 + floor(random() * 25))::text || ' processed'
        WHEN 'photo_upload' THEN 'Batch upload of ' || (5 + floor(random() * 50))::text || ' photos completed'
        WHEN 'service_restart' THEN 'Service restarted after scheduled maintenance'
        ELSE 'System check completed - all services operational'
      END,
      jsonb_build_object(
        'duration_ms', floor(random() * 1000),
        'source', CASE WHEN random() > 0.5 THEN 'automated' ELSE 'manual' END
      ),
      now() - (floor(random() * 7) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    );
  END LOOP;

END $$;