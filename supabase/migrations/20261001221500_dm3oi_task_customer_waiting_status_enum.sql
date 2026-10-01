alter type public.case_task_status
  add value if not exists 'WAITING_ON_CUSTOMER';

alter type public.case_task_status
  add value if not exists 'REQUIRED_UNAVAILABLE';
