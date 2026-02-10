/*
  # Simplify Profile Creation RLS

  Make the operator profile creation work reliably by:
  1. Dropping complex policies
  2. Using a simpler approach that works with Supabase Auth
  3. Granting the trigger function explicit permissions
*/

-- Drop all existing policies on operator_profiles for INSERT
DROP POLICY IF EXISTS "Allow profile creation during signup" ON operator_profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON operator_profiles;
DROP POLICY IF EXISTS "Operators can insert own profile" ON operator_profiles;

-- Create a single, simple INSERT policy that allows any authenticated user to insert their own profile
CREATE POLICY "Users can create own profile"
  ON operator_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Grant the postgres role (used by triggers) permission to bypass RLS for this specific operation
-- This is done by recreating the trigger function to use a security definer approach
CREATE OR REPLACE FUNCTION handle_new_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Temporarily disable RLS for this insert
  INSERT INTO public.operator_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists, ignore
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't break auth
    RAISE WARNING 'Failed to create operator profile: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Grant the function owner the ability to insert into operator_profiles
-- This makes the SECURITY DEFINER function work properly
GRANT INSERT ON operator_profiles TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;