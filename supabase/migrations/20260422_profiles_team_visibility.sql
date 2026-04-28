-- Allow company members to view profiles of other members in the same company
-- Drop conflicting policy name if it exists, then recreate
DROP POLICY IF EXISTS "Company members can view co-member profiles" ON public.profiles;

CREATE POLICY "Company members can view co-member profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm1
      JOIN public.company_members cm2 ON cm1.company_id = cm2.company_id
      WHERE cm1.user_id = auth.uid()
        AND cm2.user_id = profiles.id
    )
  );

-- Add FK from company_members.user_id → profiles.id so PostgREST can auto-join
ALTER TABLE public.company_members
  DROP CONSTRAINT IF EXISTS company_members_user_profile_fkey;

ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_user_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
