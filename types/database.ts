import type {
  Database as GeneratedDatabase,
  Json,
} from "./database.generated";

export type { Json };

type PublicSchema = GeneratedDatabase["public"];
type Views = PublicSchema["Views"];
type Functions = PublicSchema["Functions"];

// PostgREST 14 conservatively emits nullable columns for these security-barrier
// tenant projection views. Their underlying view contracts require the keys
// narrowed below, so keep application narrowing here instead of editing the
// generated remote-schema artifact.
type WithNonNullable<
  Row,
  Keys extends keyof Row,
> = Omit<Row, Keys> & {
  [Key in Keys]-?: NonNullable<Row[Key]>;
};

type ViewWithRow<
  Name extends keyof Views,
  Row,
> = Omit<Views[Name], "Row"> & {
  Row: Row;
};

type WithNullableFunctionArgs<
  Function,
  Keys extends PropertyKey,
> = Function extends {
  Args: infer Args extends Record<string, unknown>;
}
  ? Omit<Function, "Args"> & {
      Args: Omit<Args, Extract<keyof Args, Keys>> & {
        [Key in Extract<keyof Args, Keys>]: Args[Key] | null;
      };
    }
  : Function;

type OrganizationCaseActivityRow = WithNonNullable<
  Views["organization_case_activity"]["Row"],
  | "case_id"
  | "created_at"
  | "event_data"
  | "event_type"
  | "id"
  | "organization_id"
>;

type OrganizationCaseTaskRow = WithNonNullable<
  Views["organization_case_tasks"]["Row"],
  | "blocking"
  | "case_id"
  | "created_at"
  | "description"
  | "generated_by_intake"
  | "generated_by_rule"
  | "id"
  | "organization_id"
  | "priority"
  | "required"
  | "sequence"
  | "status"
  | "title"
  | "updated_at"
>;

type OrganizationCaseRow = WithNonNullable<
  Views["organization_cases"]["Row"],
  | "case_number"
  | "case_type"
  | "created_at"
  | "customer_id"
  | "description"
  | "id"
  | "opened_at"
  | "organization_id"
  | "priority"
  | "status"
  | "title"
  | "updated_at"
>;

type OrganizationQuestionDefinitionRow =
  WithNonNullable<
    Views["organization_question_definitions"]["Row"],
    | "active"
    | "completion_condition"
    | "created_at"
    | "description"
    | "display_order"
    | "id"
    | "organization_id"
    | "question_text"
    | "require_all_options"
    | "required"
    | "response_type"
    | "track_required_options"
    | "updated_at"
  >;

type OrganizationRuleActionRow = WithNonNullable<
  Views["organization_rule_actions"]["Row"],
  | "action_type"
  | "created_at"
  | "display_order"
  | "id"
  | "organization_id"
  | "rule_definition_id"
  | "updated_at"
>;

type OrganizationRuleDefinitionRow =
  WithNonNullable<
    Views["organization_rule_definitions"]["Row"],
    | "active"
    | "condition_operator"
    | "created_at"
    | "description"
    | "display_order"
    | "id"
    | "name"
    | "organization_id"
    | "source_question_id"
    | "updated_at"
  >;

type OrganizationServiceRequestActivityRow =
  WithNonNullable<
    Views["organization_service_request_activity"]["Row"],
    | "event_type"
    | "id"
    | "metadata"
    | "occurred_at"
    | "organization_id"
    | "service_request_id"
  >;

type OrganizationServiceRequestCommunicationRow =
  WithNonNullable<
    Views["organization_service_request_communications"]["Row"],
    | "channel"
    | "communication_type"
    | "created_at"
    | "direction"
    | "id"
    | "organization_id"
    | "service_request_id"
    | "status"
  >;

type OrganizationServiceRequestMessageRow =
  WithNonNullable<
    Views["organization_service_request_messages"]["Row"],
    | "author_type"
    | "body"
    | "created_at"
    | "id"
    | "organization_id"
    | "service_request_id"
  >;

type OrganizationServiceRequestRow = WithNonNullable<
  Views["organization_service_requests"]["Row"],
  | "created_at"
  | "customer_id"
  | "description"
  | "id"
  | "last_activity_at"
  | "opened_at"
  | "organization_id"
  | "priority"
  | "request_number"
  | "status"
  | "subject"
  | "updated_at"
>;

type ProjectionViewOverrides = {
  organization_case_activity: ViewWithRow<
    "organization_case_activity",
    OrganizationCaseActivityRow
  >;
  organization_case_tasks: ViewWithRow<
    "organization_case_tasks",
    OrganizationCaseTaskRow
  >;
  organization_cases: ViewWithRow<
    "organization_cases",
    OrganizationCaseRow
  >;
  organization_question_definitions: ViewWithRow<
    "organization_question_definitions",
    OrganizationQuestionDefinitionRow
  >;
  organization_rule_actions: ViewWithRow<
    "organization_rule_actions",
    OrganizationRuleActionRow
  >;
  organization_rule_definitions: ViewWithRow<
    "organization_rule_definitions",
    OrganizationRuleDefinitionRow
  >;
  organization_service_request_activity: ViewWithRow<
    "organization_service_request_activity",
    OrganizationServiceRequestActivityRow
  >;
  organization_service_request_communications: ViewWithRow<
    "organization_service_request_communications",
    OrganizationServiceRequestCommunicationRow
  >;
  organization_service_request_messages: ViewWithRow<
    "organization_service_request_messages",
    OrganizationServiceRequestMessageRow
  >;
  organization_service_requests: ViewWithRow<
    "organization_service_requests",
    OrganizationServiceRequestRow
  >;
};

type AnalyticsIdentityFunction = Omit<
  Functions["get_my_analytics_identity_context"],
  "Args" | "Returns"
> & {
  Args: {
    target_organization_id: string | null;
    target_portal_access_id: string | null;
  };
  Returns: {
    access_role: string | null;
    access_type: string;
    organization_id: string | null;
  }[];
};

type AnalyticsFunctionOverrides = {
  get_my_analytics_identity_context: AnalyticsIdentityFunction;
  get_platform_analytics: WithNullableFunctionArgs<
    Functions["get_platform_analytics"],
    "target_start" | "target_end_exclusive"
  >;
  get_platform_authenticated_access_analytics: WithNullableFunctionArgs<
    Functions["get_platform_authenticated_access_analytics"],
    "target_start" | "target_end_exclusive"
  >;
  record_analytics_page_view_guarded: WithNullableFunctionArgs<
    Functions["record_analytics_page_view_guarded"],
    | "target_user_id"
    | "target_organization_id"
    | "target_access_role"
    | "target_referrer_host"
    | "target_device_model"
    | "target_country_code"
    | "target_region_code"
    | "target_city"
  >;
};

type ApplicationPublicSchema = Omit<
  PublicSchema,
  "Views" | "Functions"
> & {
  Views: Omit<
    Views,
    keyof ProjectionViewOverrides
  > &
    ProjectionViewOverrides;
  Functions: Omit<
    Functions,
    keyof AnalyticsFunctionOverrides
  > &
    AnalyticsFunctionOverrides;
};

export type Database = Omit<
  GeneratedDatabase,
  "public"
> & {
  public: ApplicationPublicSchema;
};
