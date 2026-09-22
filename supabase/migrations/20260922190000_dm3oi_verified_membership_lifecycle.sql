alter type public.organization_membership_status
  add value if not exists 'VERIFIED' after 'INVITED';
