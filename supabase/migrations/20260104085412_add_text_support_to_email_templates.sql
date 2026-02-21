/*\n  # Add Plain Text Email Support\n\n  1. Changes to email_templates table\n    - Add `text` column for plain text email content\n    - Make `html` column nullable (since emails can be either html or text)\n\n  2. Notes\n    - Allows sending plain text emails in addition to HTML\n    - Either html or text (or both) can be provided\n*/\n\n-- Add text column for plain text email content\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'email_templates' AND column_name = 'text'\n  ) THEN\n    ALTER TABLE email_templates ADD COLUMN text text;
\n  END IF;
\nEND $$;
\n\n-- Make html column nullable since we can now have text-only emails\nDO $$\nBEGIN\n  ALTER TABLE email_templates ALTER COLUMN html DROP NOT NULL;
\nEXCEPTION\n  WHEN others THEN\n    NULL;
 -- Column might already be nullable\nEND $$;
\n;
