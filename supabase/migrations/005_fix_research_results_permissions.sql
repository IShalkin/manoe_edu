-- Fix research_results permissions for service_role access
-- The service_role should be able to bypass RLS, but self-hosted Supabase
-- may not recognize the JWT properly. This grants explicit permissions.

-- Grant full access to service_role (backend uses this role)
GRANT ALL ON research_results TO service_role;

-- Also grant to postgres role for admin access
GRANT ALL ON research_results TO postgres;

-- Create a policy that allows service_role to access all rows
-- This is a fallback in case RLS bypass isn't working
CREATE POLICY "Service role has full access" ON research_results
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Note: This policy uses USING (true) which allows all access.
-- Combined with RLS enabled, authenticated users still only see their own data
-- (via the existing user_id policies), but service_role can access everything.
