#!/usr/bin/env bash
set -euo pipefail

supabase db reset
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/data_architecture.sql
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/live_case_workflow.sql
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/organization_administration.sql
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/question_response_workflow.sql
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/communications_center.sql
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/new_service_request_notifications.sql
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/owner_communications_visibility.sql
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/rule_builder.sql
docker exec -i supabase_db_DM3iQCM psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/rule_generated_tasks.sql
