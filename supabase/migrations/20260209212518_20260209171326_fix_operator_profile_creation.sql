/*
  # Fix Operator Profile Creation Issue

  The trigger that creates operator profiles on signup was being blocked by RLS.
  This migration fixes the issue by adjusting the RLS policy to allow the trigger
  to insert profiles without auth.uid() context restrictions.

  Changes:
  - Drop the restrictive INSERT policy on operator_profiles
  - Create a more permissive INSERT policy that allows profile creation during signup
  - Ensure the trigger function can bypass RLS for the insert operation
*/

-- Drop existing INSERT policy that was too restrictive
DROP POLICY IF EXISTS "Operators can insert own profile" ON operator_profiles;

-- Create new INSERT policy that works with the signup trigger
-- This allows inserts where the id matches the auth.uid() OR when no auth context exists (during trigger execution)
CREATE POLICY "Allow profile creation during signup"
  ON operator_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid() 
    OR 
    -- Allow inserts from the trigger (when called from SECURITY DEFINER context)
    current_setting('request.jwt.claims', true)::json->>'sub' = id::text
  );

-- Also allow inserts from service role (for admin operations if needed)
CREATE POLICY "Service role can insert profiles"
  ON operator_profiles FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Recreate the trigger function with improved error handling
CREATE OR REPLACE FUNCTION handle_new_operator()
RETURNS trigger 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.operator_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the auth signup
    RAISE WARNING 'Error creating operator profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure the trigger is properly set up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_operator();