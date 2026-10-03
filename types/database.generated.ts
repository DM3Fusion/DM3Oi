export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analytics_live_sessions: {
        Row: {
          created_at: string
          last_seen_at: string
          organization_id: string | null
          session_id: string
          signed_out_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          last_seen_at?: string
          organization_id?: string | null
          session_id: string
          signed_out_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          last_seen_at?: string
          organization_id?: string | null
          session_id?: string
          signed_out_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_live_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_page_views: {
        Row: {
          analytics_organization_key: string | null
          analytics_user_key: string | null
          browser: string
          city: string | null
          country_code: string | null
          created_at: string
          device_model: string | null
          device_type: string
          id: string
          normalized_path: string
          operating_system: string
          organization_id: string | null
          path: string
          referrer_host: string | null
          region_code: string | null
          session_id: string
          traffic_signal: string
          traffic_type: string
          user_id: string | null
        }
        Insert: {
          analytics_organization_key?: string | null
          analytics_user_key?: string | null
          browser: string
          city?: string | null
          country_code?: string | null
          created_at?: string
          device_model?: string | null
          device_type: string
          id?: string
          normalized_path: string
          operating_system: string
          organization_id?: string | null
          path: string
          referrer_host?: string | null
          region_code?: string | null
          session_id: string
          traffic_signal?: string
          traffic_type?: string
          user_id?: string | null
        }
        Update: {
          analytics_organization_key?: string | null
          analytics_user_key?: string | null
          browser?: string
          city?: string | null
          country_code?: string | null
          created_at?: string
          device_model?: string | null
          device_type?: string
          id?: string
          normalized_path?: string
          operating_system?: string
          organization_id?: string | null
          path?: string
          referrer_host?: string | null
          region_code?: string | null
          session_id?: string
          traffic_signal?: string
          traffic_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_page_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_activity: {
        Row: {
          actor_user_id: string | null
          case_id: string
          created_at: string
          event_data: Json
          event_type: string
          id: string
          organization_id: string
        }
        Insert: {
          actor_user_id?: string | null
          case_id: string
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          organization_id: string
        }
        Update: {
          actor_user_id?: string | null
          case_id?: string
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_activity_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_activity_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_activity_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "case_activity_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_activity_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      case_assignments: {
        Row: {
          assigned_at: string
          assigned_by_user_id: string
          assignment_role: Database["public"]["Enums"]["assignment_role"]
          case_id: string
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          unassigned_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by_user_id: string
          assignment_role?: Database["public"]["Enums"]["assignment_role"]
          case_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          unassigned_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by_user_id?: string
          assignment_role?: Database["public"]["Enums"]["assignment_role"]
          case_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          unassigned_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_assignments_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_assignments_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_assignments_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "case_assignments_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_assignments_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_assignments_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      case_document_confirmations: {
        Row: {
          case_id: string
          created_at: string
          customer_id: string
          id: string
          organization_id: string
          portal_access_id: string | null
          reported_by_user_id: string | null
          reported_sent_at: string
          task_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          customer_id: string
          id?: string
          organization_id: string
          portal_access_id?: string | null
          reported_by_user_id?: string | null
          reported_sent_at?: string
          task_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          organization_id?: string
          portal_access_id?: string | null
          reported_by_user_id?: string | null
          reported_sent_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_document_confirmations_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_document_confirmations_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "case_document_confirmations_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_document_confirmations_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_document_confirmations_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_document_confirmations_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_document_confirmations_portal_access_id_fkey"
            columns: ["portal_access_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_document_confirmations_reported_by_user_id_fkey"
            columns: ["reported_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_document_confirmations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "case_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_document_confirmations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "organization_case_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      case_question_responses: {
        Row: {
          case_id: string
          case_question_id: string
          created_at: string
          id: string
          organization_id: string
          responded_by_user_id: string
          response_value: Json
          updated_at: string
        }
        Insert: {
          case_id: string
          case_question_id: string
          created_at?: string
          id?: string
          organization_id: string
          responded_by_user_id: string
          response_value: Json
          updated_at?: string
        }
        Update: {
          case_id?: string
          case_question_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          responded_by_user_id?: string
          response_value?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_question_responses_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_question_responses_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "case_question_responses_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_question_responses_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_question_responses_organization_id_case_question_id_fkey"
            columns: ["organization_id", "case_question_id"]
            isOneToOne: false
            referencedRelation: "case_questions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_question_responses_responded_by_user_id_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_questions: {
        Row: {
          case_id: string
          created_at: string
          description: string
          display_order: number
          id: string
          options_snapshot: Json
          organization_id: string
          question_definition_id: string | null
          question_text: string
          required: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
        }
        Insert: {
          case_id: string
          created_at?: string
          description?: string
          display_order: number
          id?: string
          options_snapshot?: Json
          organization_id: string
          question_definition_id?: string | null
          question_text: string
          required: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
        }
        Update: {
          case_id?: string
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          options_snapshot?: Json
          organization_id?: string
          question_definition_id?: string | null
          question_text?: string
          required?: boolean
          response_type?: Database["public"]["Enums"]["question_response_type"]
        }
        Relationships: [
          {
            foreignKeyName: "case_questions_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_questions_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "case_questions_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_questions_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_questions_organization_id_question_definition_id_fkey"
            columns: ["organization_id", "question_definition_id"]
            isOneToOne: false
            referencedRelation: "organization_question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_questions_organization_id_question_definition_id_fkey"
            columns: ["organization_id", "question_definition_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      case_tasks: {
        Row: {
          assigned_user_id: string | null
          blocking: boolean
          case_id: string
          completed_at: string | null
          completed_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          description: string
          due_at: string | null
          id: string
          intake_follow_up_id: string | null
          intake_question_definition_id: string | null
          intake_requirement_context: Json | null
          organization_id: string
          prior_actionable_status:
            | Database["public"]["Enums"]["case_task_status"]
            | null
          priority: Database["public"]["Enums"]["priority_level"]
          required: boolean
          sequence: number
          source_rule_action_id: string | null
          source_rule_id: string | null
          status: Database["public"]["Enums"]["case_task_status"]
          task_purpose_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          blocking?: boolean
          case_id: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          description?: string
          due_at?: string | null
          id?: string
          intake_follow_up_id?: string | null
          intake_question_definition_id?: string | null
          intake_requirement_context?: Json | null
          organization_id: string
          prior_actionable_status?:
            | Database["public"]["Enums"]["case_task_status"]
            | null
          priority?: Database["public"]["Enums"]["priority_level"]
          required?: boolean
          sequence?: number
          source_rule_action_id?: string | null
          source_rule_id?: string | null
          status?: Database["public"]["Enums"]["case_task_status"]
          task_purpose_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          blocking?: boolean
          case_id?: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string
          due_at?: string | null
          id?: string
          intake_follow_up_id?: string | null
          intake_question_definition_id?: string | null
          intake_requirement_context?: Json | null
          organization_id?: string
          prior_actionable_status?:
            | Database["public"]["Enums"]["case_task_status"]
            | null
          priority?: Database["public"]["Enums"]["priority_level"]
          required?: boolean
          sequence?: number
          source_rule_action_id?: string | null
          source_rule_id?: string | null
          status?: Database["public"]["Enums"]["case_task_status"]
          task_purpose_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_tasks_completed_by_user_id_fkey"
            columns: ["completed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_intake_question_fkey"
            columns: ["organization_id", "intake_question_definition_id"]
            isOneToOne: false
            referencedRelation: "organization_question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_intake_question_fkey"
            columns: ["organization_id", "intake_question_definition_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_assigned_user_id_fkey"
            columns: ["organization_id", "assigned_user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_rule_action_provenance_fkey"
            columns: [
              "organization_id",
              "source_rule_id",
              "source_rule_action_id",
            ]
            isOneToOne: false
            referencedRelation: "organization_rule_actions"
            referencedColumns: ["organization_id", "rule_definition_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_rule_action_provenance_fkey"
            columns: [
              "organization_id",
              "source_rule_id",
              "source_rule_action_id",
            ]
            isOneToOne: false
            referencedRelation: "rule_actions"
            referencedColumns: ["organization_id", "rule_definition_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_task_purpose_fkey"
            columns: ["organization_id", "task_purpose_id"]
            isOneToOne: false
            referencedRelation: "organization_task_purposes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      cases: {
        Row: {
          case_number: string
          case_title_id: string | null
          case_type: string
          case_type_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          intake_submission_key: string | null
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
          tax_outcome: string | null
          tax_year: number | null
          title: string
          updated_at: string
        }
        Insert: {
          case_number: string
          case_title_id?: string | null
          case_type: string
          case_type_id?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id: string
          customer_id: string
          description?: string
          due_at?: string | null
          id?: string
          intake_submission_key?: string | null
          manager_user_id?: string | null
          opened_at?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["priority_level"]
          status?: Database["public"]["Enums"]["case_status"]
          tax_outcome?: string | null
          tax_year?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          case_number?: string
          case_title_id?: string | null
          case_type?: string
          case_type_id?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          customer_id?: string
          description?: string
          due_at?: string | null
          id?: string
          intake_submission_key?: string | null
          manager_user_id?: string | null
          opened_at?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          status?: Database["public"]["Enums"]["case_status"]
          tax_outcome?: string | null
          tax_year?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_case_title_identity_fkey"
            columns: ["organization_id", "case_title_id"]
            isOneToOne: false
            referencedRelation: "organization_case_titles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_case_type_identity_fkey"
            columns: ["organization_id", "case_type_id"]
            isOneToOne: false
            referencedRelation: "organization_case_types"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_organization_id_manager_user_id_fkey"
            columns: ["organization_id", "manager_user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      configuration_template_question_options: {
        Row: {
          display_order: number
          id: string
          is_active: boolean
          option_label: string
          option_value: string
          source_option_id: string
          template_id: string
          template_question_id: string
        }
        Insert: {
          display_order?: number
          id?: string
          is_active?: boolean
          option_label: string
          option_value: string
          source_option_id: string
          template_id: string
          template_question_id: string
        }
        Update: {
          display_order?: number
          id?: string
          is_active?: boolean
          option_label?: string
          option_value?: string
          source_option_id?: string
          template_id?: string
          template_question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuration_template_questi_template_id_template_questio_fkey"
            columns: ["template_id", "template_question_id"]
            isOneToOne: false
            referencedRelation: "configuration_template_questions"
            referencedColumns: ["template_id", "id"]
          },
          {
            foreignKeyName: "configuration_template_question_options_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "configuration_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      configuration_template_questions: {
        Row: {
          active: boolean
          completion_condition: string
          description: string
          display_order: number
          id: string
          question_group: string | null
          question_text: string
          require_all_options: boolean
          required: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
          source_question_id: string
          template_id: string
          track_required_options: boolean
        }
        Insert: {
          active?: boolean
          completion_condition?: string
          description?: string
          display_order?: number
          id?: string
          question_group?: string | null
          question_text: string
          require_all_options?: boolean
          required?: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
          source_question_id: string
          template_id: string
          track_required_options?: boolean
        }
        Update: {
          active?: boolean
          completion_condition?: string
          description?: string
          display_order?: number
          id?: string
          question_group?: string | null
          question_text?: string
          require_all_options?: boolean
          required?: boolean
          response_type?: Database["public"]["Enums"]["question_response_type"]
          source_question_id?: string
          template_id?: string
          track_required_options?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "configuration_template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "configuration_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      configuration_template_rule_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["rule_action_type"]
          display_order: number
          id: string
          source_action_id: string
          target_template_question_id: string | null
          task_blocking: boolean | null
          task_description: string | null
          task_due_in_days: number | null
          task_priority: Database["public"]["Enums"]["priority_level"] | null
          task_required: boolean | null
          task_title: string | null
          template_id: string
          template_rule_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["rule_action_type"]
          display_order?: number
          id?: string
          source_action_id: string
          target_template_question_id?: string | null
          task_blocking?: boolean | null
          task_description?: string | null
          task_due_in_days?: number | null
          task_priority?: Database["public"]["Enums"]["priority_level"] | null
          task_required?: boolean | null
          task_title?: string | null
          template_id: string
          template_rule_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["rule_action_type"]
          display_order?: number
          id?: string
          source_action_id?: string
          target_template_question_id?: string | null
          task_blocking?: boolean | null
          task_description?: string | null
          task_due_in_days?: number | null
          task_priority?: Database["public"]["Enums"]["priority_level"] | null
          task_required?: boolean | null
          task_title?: string | null
          template_id?: string
          template_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuration_template_rule_a_template_id_target_template__fkey"
            columns: ["template_id", "target_template_question_id"]
            isOneToOne: false
            referencedRelation: "configuration_template_questions"
            referencedColumns: ["template_id", "id"]
          },
          {
            foreignKeyName: "configuration_template_rule_a_template_id_template_rule_id_fkey"
            columns: ["template_id", "template_rule_id"]
            isOneToOne: false
            referencedRelation: "configuration_template_rules"
            referencedColumns: ["template_id", "id"]
          },
          {
            foreignKeyName: "configuration_template_rule_actions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "configuration_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      configuration_template_rules: {
        Row: {
          active: boolean
          condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          condition_template_option_id: string | null
          description: string
          display_order: number
          id: string
          name: string
          source_rule_id: string
          source_template_question_id: string
          template_id: string
        }
        Insert: {
          active?: boolean
          condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          condition_template_option_id?: string | null
          description?: string
          display_order?: number
          id?: string
          name: string
          source_rule_id: string
          source_template_question_id: string
          template_id: string
        }
        Update: {
          active?: boolean
          condition_operator?: Database["public"]["Enums"]["rule_condition_operator"]
          condition_template_option_id?: string | null
          description?: string
          display_order?: number
          id?: string
          name?: string
          source_rule_id?: string
          source_template_question_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuration_template_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "configuration_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuration_template_rules_template_id_source_template__fkey1"
            columns: [
              "template_id",
              "source_template_question_id",
              "condition_template_option_id",
            ]
            isOneToOne: false
            referencedRelation: "configuration_template_question_options"
            referencedColumns: ["template_id", "template_question_id", "id"]
          },
          {
            foreignKeyName: "configuration_template_rules_template_id_source_template_q_fkey"
            columns: ["template_id", "source_template_question_id"]
            isOneToOne: false
            referencedRelation: "configuration_template_questions"
            referencedColumns: ["template_id", "id"]
          },
        ]
      }
      configuration_templates: {
        Row: {
          created_at: string
          created_by_user_id: string
          description: string | null
          id: string
          name: string
          source_organization_id: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          description?: string | null
          id?: string
          name: string
          source_organization_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          id?: string
          name?: string
          source_organization_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "configuration_templates_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuration_templates_source_organization_id_fkey"
            columns: ["source_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_import_submissions: {
        Row: {
          correction_instructions: string | null
          created_at: string
          file_disposition: string
          file_size_bytes: number
          id: string
          import_result: Json | null
          imported_at: string | null
          imported_by_user_id: string | null
          mime_type: string
          organization_id: string
          organization_note: string | null
          original_filename: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          source_file_deleted_at: string | null
          source_file_deleted_by_user_id: string | null
          status: string
          storage_bucket: string
          storage_path: string
          super_admin_note: string | null
          updated_at: string
          uploaded_by_user_id: string
        }
        Insert: {
          correction_instructions?: string | null
          created_at?: string
          file_disposition?: string
          file_size_bytes: number
          id?: string
          import_result?: Json | null
          imported_at?: string | null
          imported_by_user_id?: string | null
          mime_type: string
          organization_id: string
          organization_note?: string | null
          original_filename: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          source_file_deleted_at?: string | null
          source_file_deleted_by_user_id?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          super_admin_note?: string | null
          updated_at?: string
          uploaded_by_user_id: string
        }
        Update: {
          correction_instructions?: string | null
          created_at?: string
          file_disposition?: string
          file_size_bytes?: number
          id?: string
          import_result?: Json | null
          imported_at?: string | null
          imported_by_user_id?: string | null
          mime_type?: string
          organization_id?: string
          organization_note?: string | null
          original_filename?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          source_file_deleted_at?: string | null
          source_file_deleted_by_user_id?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          super_admin_note?: string | null
          updated_at?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_import_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_merge_history: {
        Row: {
          dependency_move_summary: Json
          field_resolution: Json
          id: string
          merged_customer_id: string
          merged_customer_number: string
          merged_customer_snapshot: Json
          organization_id: string
          performed_at: string
          performed_by_user_id: string
          surviving_customer_id: string
          surviving_customer_number: string
          surviving_customer_snapshot: Json
        }
        Insert: {
          dependency_move_summary: Json
          field_resolution: Json
          id?: string
          merged_customer_id: string
          merged_customer_number: string
          merged_customer_snapshot: Json
          organization_id: string
          performed_at?: string
          performed_by_user_id: string
          surviving_customer_id: string
          surviving_customer_number: string
          surviving_customer_snapshot: Json
        }
        Update: {
          dependency_move_summary?: Json
          field_resolution?: Json
          id?: string
          merged_customer_id?: string
          merged_customer_number?: string
          merged_customer_snapshot?: Json
          organization_id?: string
          performed_at?: string
          performed_by_user_id?: string
          surviving_customer_id?: string
          surviving_customer_number?: string
          surviving_customer_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "customer_merge_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_invitations: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          id: string
          last_sent_at: string | null
          organization_id: string
          recipient_email: string
          send_count: number
          sent_at: string | null
          status: string
          updated_at: string
          updated_by_user_id: string | null
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_id: string
          id?: string
          last_sent_at?: string | null
          organization_id: string
          recipient_email: string
          send_count?: number
          sent_at?: string | null
          status: string
          updated_at?: string
          updated_by_user_id?: string | null
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_id?: string
          id?: string
          last_sent_at?: string | null
          organization_id?: string
          recipient_email?: string
          send_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
          updated_by_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_invitations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_invitations_portal_user_fkey"
            columns: ["organization_id", "customer_id", "user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["organization_id", "customer_id", "user_id"]
          },
          {
            foreignKeyName: "customer_portal_invitations_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_users: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_active: boolean
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_active?: boolean
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_users_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_portal_users_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_portal_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          city: string | null
          created_at: string
          created_by_user_id: string | null
          customer_number: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          postal_code: string | null
          state: string | null
          status: Database["public"]["Enums"]["customer_status"]
          street_address: string | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_number: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          street_address?: string | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_number?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          street_address?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_deliveries: {
        Row: {
          case_id: string | null
          created_at: string
          customer_id: string | null
          delivery_status: string
          error_code: string | null
          error_summary: string | null
          failed_at: string | null
          id: string
          membership_id: string | null
          opened_at: string | null
          organization_id: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_user_id: string | null
          sent_at: string | null
          service_request_id: string | null
          subject: string
          template_key: string
          tracking_token: string
          trial_request_id: string | null
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_status?: string
          error_code?: string | null
          error_summary?: string | null
          failed_at?: string | null
          id?: string
          membership_id?: string | null
          opened_at?: string | null
          organization_id?: string | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          sent_at?: string | null
          service_request_id?: string | null
          subject: string
          template_key: string
          tracking_token?: string
          trial_request_id?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_status?: string
          error_code?: string | null
          error_summary?: string | null
          failed_at?: string | null
          id?: string
          membership_id?: string | null
          opened_at?: string | null
          organization_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          service_request_id?: string | null
          subject?: string
          template_key?: string
          tracking_token?: string
          trial_request_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_deliveries_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_membership_id_fkey"
            columns: ["organization_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_service_request_id_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "organization_service_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_deliveries_organization_id_service_request_id_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_deliveries_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "platform_email_templates"
            referencedColumns: ["template_key"]
          },
          {
            foreignKeyName: "email_deliveries_trial_request_id_fkey"
            columns: ["trial_request_id"]
            isOneToOne: false
            referencedRelation: "trial_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      guided_case_intake_drafts: {
        Row: {
          answers: Json
          case_id: string | null
          case_title_id: string | null
          case_type_id: string | null
          created_at: string
          created_by_user_id: string
          current_step: number
          customer_id: string | null
          customer_mode: string
          description: string
          finalized_at: string | null
          follow_up_tasks: Json
          id: string
          manager_user_id: string | null
          new_customer: Json
          organization_id: string
          portal_onboarding: Json
          priority: Database["public"]["Enums"]["priority_level"]
          required_option_ids: Json
          staff_user_ids: string[]
          submission_key: string
          tax_year: number | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          case_id?: string | null
          case_title_id?: string | null
          case_type_id?: string | null
          created_at?: string
          created_by_user_id: string
          current_step?: number
          customer_id?: string | null
          customer_mode?: string
          description?: string
          finalized_at?: string | null
          follow_up_tasks?: Json
          id?: string
          manager_user_id?: string | null
          new_customer?: Json
          organization_id: string
          portal_onboarding?: Json
          priority?: Database["public"]["Enums"]["priority_level"]
          required_option_ids?: Json
          staff_user_ids?: string[]
          submission_key: string
          tax_year?: number | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          case_id?: string | null
          case_title_id?: string | null
          case_type_id?: string | null
          created_at?: string
          created_by_user_id?: string
          current_step?: number
          customer_id?: string | null
          customer_mode?: string
          description?: string
          finalized_at?: string | null
          follow_up_tasks?: Json
          id?: string
          manager_user_id?: string | null
          new_customer?: Json
          organization_id?: string
          portal_onboarding?: Json
          priority?: Database["public"]["Enums"]["priority_level"]
          required_option_ids?: Json
          staff_user_ids?: string[]
          submission_key?: string
          tax_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guided_case_intake_drafts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_case_title_id_fkey"
            columns: ["organization_id", "case_title_id"]
            isOneToOne: false
            referencedRelation: "organization_case_titles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_case_type_id_fkey"
            columns: ["organization_id", "case_type_id"]
            isOneToOne: false
            referencedRelation: "organization_case_types"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guided_case_intake_drafts_organization_id_manager_user_id_fkey"
            columns: ["organization_id", "manager_user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          destination_path: string
          id: string
          message: string
          notification_type: string
          organization_id: string
          read_at: string | null
          recipient_user_id: string
          source_domain: string
          source_entity_id: string
          source_event_id: string | null
          title: string
        }
        Insert: {
          archived_at?: string | null
          category: string
          created_at?: string
          destination_path: string
          id?: string
          message: string
          notification_type: string
          organization_id: string
          read_at?: string | null
          recipient_user_id: string
          source_domain: string
          source_entity_id: string
          source_event_id?: string | null
          title: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          destination_path?: string
          id?: string
          message?: string
          notification_type?: string
          organization_id?: string
          read_at?: string | null
          recipient_user_id?: string
          source_domain?: string
          source_entity_id?: string
          source_event_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_case_number_counters: {
        Row: {
          next_number: number
          organization_id: string
        }
        Insert: {
          next_number?: number
          organization_id: string
        }
        Update: {
          next_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_case_number_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_case_title_type_mappings: {
        Row: {
          case_title_id: string
          case_type_id: string
          created_at: string
          created_by_user_id: string | null
          organization_id: string
        }
        Insert: {
          case_title_id: string
          case_type_id: string
          created_at?: string
          created_by_user_id?: string | null
          organization_id: string
        }
        Update: {
          case_title_id?: string
          case_type_id?: string
          created_at?: string
          created_by_user_id?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_case_title_type__organization_id_case_title_i_fkey"
            columns: ["organization_id", "case_title_id"]
            isOneToOne: false
            referencedRelation: "organization_case_titles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_case_title_type__organization_id_case_type_id_fkey"
            columns: ["organization_id", "case_type_id"]
            isOneToOne: false
            referencedRelation: "organization_case_types"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_case_title_type_mappings_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_case_title_type_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_case_titles: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          is_active: boolean
          label: string
          organization_id: string
          sort_order: number
          updated_at: string
          updated_by_user_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          is_active?: boolean
          label: string
          organization_id: string
          sort_order?: number
          updated_at?: string
          updated_by_user_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          is_active?: boolean
          label?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_case_titles_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_case_titles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_case_titles_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_case_types: {
        Row: {
          created_at: string
          customer_mode: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          tax_year_rule: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_mode?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
          tax_year_rule?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_mode?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          tax_year_rule?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_case_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_configuration_template_applications: {
        Row: {
          applied_at: string
          applied_by_user_id: string
          configuration_template_id: string
          id: string
          organization_id: string
          template_version: number
        }
        Insert: {
          applied_at?: string
          applied_by_user_id: string
          configuration_template_id: string
          id?: string
          organization_id: string
          template_version: number
        }
        Update: {
          applied_at?: string
          applied_by_user_id?: string
          configuration_template_id?: string
          id?: string
          organization_id?: string
          template_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_configuration_templ_configuration_template_id_fkey"
            columns: ["configuration_template_id"]
            isOneToOne: false
            referencedRelation: "configuration_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_configuration_template_app_applied_by_user_id_fkey"
            columns: ["applied_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_configuration_template_applic_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_customer_annual_number_counters: {
        Row: {
          calendar_year: number
          customer_type: Database["public"]["Enums"]["customer_type"]
          next_number: number
          organization_id: string
        }
        Insert: {
          calendar_year: number
          customer_type: Database["public"]["Enums"]["customer_type"]
          next_number?: number
          organization_id: string
        }
        Update: {
          calendar_year?: number
          customer_type?: Database["public"]["Enums"]["customer_type"]
          next_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_customer_annual_number_counte_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_customer_number_counters: {
        Row: {
          next_number: number
          organization_id: string
        }
        Insert: {
          next_number?: number
          organization_id: string
        }
        Update: {
          next_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_customer_number_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_license_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["license_event_type"]
          id: string
          license_id: string | null
          organization_id: string
          prior_values: Json
          reason: string | null
          resulting_values: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["license_event_type"]
          id?: string
          license_id?: string | null
          organization_id: string
          prior_values?: Json
          reason?: string | null
          resulting_values?: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["license_event_type"]
          id?: string
          license_id?: string | null
          organization_id?: string
          prior_values?: Json
          reason?: string | null
          resulting_values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "organization_license_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_license_events_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "organization_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_license_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_licenses: {
        Row: {
          commercial_state: Database["public"]["Enums"]["commercial_state"]
          created_at: string
          created_by: string | null
          expires_at: string | null
          grace_ends_at: string | null
          id: string
          is_current: boolean
          license_status: Database["public"]["Enums"]["license_status"]
          notes: string | null
          notice_days: number
          notification_thresholds: number[]
          organization_id: string
          plan_code: string
          starts_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commercial_state: Database["public"]["Enums"]["commercial_state"]
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grace_ends_at?: string | null
          id?: string
          is_current?: boolean
          license_status: Database["public"]["Enums"]["license_status"]
          notes?: string | null
          notice_days?: number
          notification_thresholds?: number[]
          organization_id: string
          plan_code?: string
          starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commercial_state?: Database["public"]["Enums"]["commercial_state"]
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grace_ends_at?: string | null
          id?: string
          is_current?: boolean
          license_status?: Database["public"]["Enums"]["license_status"]
          notes?: string | null
          notice_days?: number
          notification_thresholds?: number[]
          organization_id?: string
          plan_code?: string
          starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_licenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_licenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_licenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_lifecycle_statuses: {
        Row: {
          description: string | null
          display_label: string
          is_active: boolean
          organization_id: string
          sort_order: number
          status: Database["public"]["Enums"]["case_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          display_label: string
          is_active?: boolean
          organization_id: string
          sort_order?: number
          status: Database["public"]["Enums"]["case_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          display_label?: string
          is_active?: boolean
          organization_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_lifecycle_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_lifecycle_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          activated_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          is_active: boolean
          joined_at: string
          organization_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["application_role"]
          status: Database["public"]["Enums"]["organization_membership_status"]
          suspended_at: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          joined_at?: string
          organization_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["application_role"]
          status?: Database["public"]["Enums"]["organization_membership_status"]
          suspended_at?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          joined_at?: string
          organization_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["application_role"]
          status?: Database["public"]["Enums"]["organization_membership_status"]
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_membership_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          membership_id: string | null
          new_status: Database["public"]["Enums"]["organization_membership_status"]
          note: string | null
          organization_id: string
          prior_status:
            | Database["public"]["Enums"]["organization_membership_status"]
            | null
          user_display_name: string | null
          user_email: string
          user_id: string | null
          user_role: Database["public"]["Enums"]["application_role"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          membership_id?: string | null
          new_status: Database["public"]["Enums"]["organization_membership_status"]
          note?: string | null
          organization_id: string
          prior_status?:
            | Database["public"]["Enums"]["organization_membership_status"]
            | null
          user_display_name?: string | null
          user_email: string
          user_id?: string | null
          user_role: Database["public"]["Enums"]["application_role"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          membership_id?: string | null
          new_status?: Database["public"]["Enums"]["organization_membership_status"]
          note?: string | null
          organization_id?: string
          prior_status?:
            | Database["public"]["Enums"]["organization_membership_status"]
            | null
          user_display_name?: string | null
          user_email?: string
          user_id?: string | null
          user_role?: Database["public"]["Enums"]["application_role"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_membership_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_membership_events_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_membership_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_membership_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_role_permissions: {
        Row: {
          created_at: string
          id: string
          is_allowed: boolean
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["application_role"]
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_allowed: boolean
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["application_role"]
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          organization_id?: string
          permission?: string
          role?: Database["public"]["Enums"]["application_role"]
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_role_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_service_request_annual_number_counters: {
        Row: {
          calendar_year: number
          last_number: number
          organization_id: string
        }
        Insert: {
          calendar_year: number
          last_number?: number
          organization_id: string
        }
        Update: {
          calendar_year?: number
          last_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_service_request_annual_number_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          default_priority: Database["public"]["Enums"]["priority_level"]
          document_submission_instructions: string | null
          organization_id: string
          portal_enabled: boolean
          portal_onboarding_mode: string
          portal_show_priority: boolean
          portal_submission_enabled: boolean
          portal_support_label: string | null
          portal_welcome_message: string | null
          secure_document_system_url: string | null
          timezone: string
          timezone_resolved_from_postal_code: string | null
          timezone_source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_priority?: Database["public"]["Enums"]["priority_level"]
          document_submission_instructions?: string | null
          organization_id: string
          portal_enabled?: boolean
          portal_onboarding_mode?: string
          portal_show_priority?: boolean
          portal_submission_enabled?: boolean
          portal_support_label?: string | null
          portal_welcome_message?: string | null
          secure_document_system_url?: string | null
          timezone?: string
          timezone_resolved_from_postal_code?: string | null
          timezone_source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_priority?: Database["public"]["Enums"]["priority_level"]
          document_submission_instructions?: string | null
          organization_id?: string
          portal_enabled?: boolean
          portal_onboarding_mode?: string
          portal_show_priority?: boolean
          portal_submission_enabled?: boolean
          portal_support_label?: string | null
          portal_welcome_message?: string | null
          secure_document_system_url?: string | null
          timezone?: string
          timezone_resolved_from_postal_code?: string | null
          timezone_source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_task_purposes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_task_purposes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          avatar_path: string | null
          avatar_updated_at: string | null
          business_postal_code: string | null
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_updated_at?: string | null
          business_postal_code?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["organization_status"]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_updated_at?: string | null
          business_postal_code?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["organization_status"]
          updated_at?: string
        }
        Relationships: []
      }
      platform_case_deletion_audit: {
        Row: {
          actor_user_id: string
          case_snapshot: Json
          created_at: string
          deleted_case_ids: string[]
          deleted_case_numbers: string[]
          deleted_counts: Json
          id: string
          organization_id: string
          organization_name: string
        }
        Insert: {
          actor_user_id: string
          case_snapshot?: Json
          created_at?: string
          deleted_case_ids?: string[]
          deleted_case_numbers?: string[]
          deleted_counts?: Json
          id?: string
          organization_id: string
          organization_name: string
        }
        Update: {
          actor_user_id?: string
          case_snapshot?: Json
          created_at?: string
          deleted_case_ids?: string[]
          deleted_case_numbers?: string[]
          deleted_counts?: Json
          id?: string
          organization_id?: string
          organization_name?: string
        }
        Relationships: []
      }
      platform_communication_deletion_audit: {
        Row: {
          actor_user_id: string
          created_at: string
          deleted_record_id: string
          id: string
          organization_id: string
          organization_name: string
          reason: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          record_created_at: string | null
          record_kind: string
          title: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          deleted_record_id: string
          id?: string
          organization_id: string
          organization_name: string
          reason?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          record_created_at?: string | null
          record_kind: string
          title: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          deleted_record_id?: string
          id?: string
          organization_id?: string
          organization_name?: string
          reason?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          record_created_at?: string | null
          record_kind?: string
          title?: string
        }
        Relationships: []
      }
      platform_email_templates: {
        Row: {
          closing_message: string
          opening_message: string
          subject_template: string
          template_key: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          closing_message: string
          opening_message: string
          subject_template: string
          template_key: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          closing_message?: string
          opening_message?: string
          subject_template?: string
          template_key?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: []
      }
      platform_organization_deletion_audit: {
        Row: {
          actor_user_id: string
          cleanup_updated_at: string
          created_at: string
          deleted_counts: Json
          deleted_organization_id: string
          deletion_type: string
          id: string
          identity_cleanup: Json
          organization_name: string
          organization_slug: string
          storage_cleanup: Json
        }
        Insert: {
          actor_user_id: string
          cleanup_updated_at?: string
          created_at?: string
          deleted_counts?: Json
          deleted_organization_id: string
          deletion_type?: string
          id?: string
          identity_cleanup?: Json
          organization_name: string
          organization_slug: string
          storage_cleanup?: Json
        }
        Update: {
          actor_user_id?: string
          cleanup_updated_at?: string
          created_at?: string
          deleted_counts?: Json
          deleted_organization_id?: string
          deletion_type?: string
          id?: string
          identity_cleanup?: Json
          organization_name?: string
          organization_slug?: string
          storage_cleanup?: Json
        }
        Relationships: []
      }
      platform_organization_reset_audit: {
        Row: {
          actor_user_id: string
          created_at: string
          deleted_counts: Json
          id: string
          identity_cleanup: Json
          organization_id: string
          organization_name: string
          preserved_owner_user_id: string
          reset_type: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          deleted_counts?: Json
          id?: string
          identity_cleanup?: Json
          organization_id: string
          organization_name: string
          preserved_owner_user_id: string
          reset_type?: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          deleted_counts?: Json
          id?: string
          identity_cleanup?: Json
          organization_id?: string
          organization_name?: string
          preserved_owner_user_id?: string
          reset_type?: string
        }
        Relationships: []
      }
      platform_trial_request_deletion_audit: {
        Row: {
          actor_user_id: string
          business_name: string
          converted_organization_id: string | null
          created_at: string
          deleted_history_count: number
          history_snapshot: Json
          id: string
          request_number: number
          request_snapshot: Json
          status: string
          trial_request_id: string
        }
        Insert: {
          actor_user_id: string
          business_name: string
          converted_organization_id?: string | null
          created_at?: string
          deleted_history_count?: number
          history_snapshot?: Json
          id?: string
          request_number: number
          request_snapshot: Json
          status: string
          trial_request_id: string
        }
        Update: {
          actor_user_id?: string
          business_name?: string
          converted_organization_id?: string | null
          created_at?: string
          deleted_history_count?: number
          history_snapshot?: Json
          id?: string
          request_number?: number
          request_snapshot?: Json
          status?: string
          trial_request_id?: string
        }
        Relationships: []
      }
      platform_user_roles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["application_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["application_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["application_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_updated_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_updated_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          is_active?: boolean
          last_name?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_updated_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_landing_page_drafts: {
        Row: {
          content: Json
          id: string
          page_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: Json
          id?: string
          page_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          id?: string
          page_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      public_landing_page_publication_history: {
        Row: {
          acted_at: string
          acted_by: string | null
          action: string
          from_version_id: string | null
          id: string
          page_key: string
          to_version_id: string
        }
        Insert: {
          acted_at?: string
          acted_by?: string | null
          action: string
          from_version_id?: string | null
          id?: string
          page_key: string
          to_version_id: string
        }
        Update: {
          acted_at?: string
          acted_by?: string | null
          action?: string
          from_version_id?: string | null
          id?: string
          page_key?: string
          to_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_landing_page_publication_history_from_version_id_fkey"
            columns: ["from_version_id"]
            isOneToOne: false
            referencedRelation: "public_landing_page_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_landing_page_publication_history_to_version_id_fkey"
            columns: ["to_version_id"]
            isOneToOne: false
            referencedRelation: "public_landing_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      public_landing_page_publications: {
        Row: {
          page_key: string
          updated_at: string
          updated_by: string | null
          version_id: string
        }
        Insert: {
          page_key: string
          updated_at?: string
          updated_by?: string | null
          version_id: string
        }
        Update: {
          page_key?: string
          updated_at?: string
          updated_by?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_landing_page_publications_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "public_landing_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      public_landing_page_versions: {
        Row: {
          content: Json
          id: string
          page_key: string
          published_at: string
          published_by: string | null
          version: number
        }
        Insert: {
          content: Json
          id?: string
          page_key: string
          published_at?: string
          published_by?: string | null
          version: number
        }
        Update: {
          content?: Json
          id?: string
          page_key?: string
          published_at?: string
          published_by?: string | null
          version?: number
        }
        Relationships: []
      }
      question_definitions: {
        Row: {
          active: boolean
          completion_condition: string
          created_at: string
          created_by_user_id: string
          description: string
          display_order: number
          id: string
          organization_id: string
          question_group: string | null
          question_text: string
          require_all_options: boolean
          required: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
          track_required_options: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          completion_condition?: string
          created_at?: string
          created_by_user_id: string
          description?: string
          display_order?: number
          id?: string
          organization_id: string
          question_group?: string | null
          question_text: string
          require_all_options?: boolean
          required?: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
          track_required_options?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          completion_condition?: string
          created_at?: string
          created_by_user_id?: string
          description?: string
          display_order?: number
          id?: string
          organization_id?: string
          question_group?: string | null
          question_text?: string
          require_all_options?: boolean
          required?: boolean
          response_type?: Database["public"]["Enums"]["question_response_type"]
          track_required_options?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_definitions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          option_label: string
          option_value: string
          organization_id: string
          question_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          option_label: string
          option_value: string
          organization_id: string
          question_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          option_label?: string
          option_value?: string
          organization_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_options_organization_id_question_id_fkey"
            columns: ["organization_id", "question_id"]
            isOneToOne: false
            referencedRelation: "organization_question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "question_options_organization_id_question_id_fkey"
            columns: ["organization_id", "question_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      rule_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["rule_action_type"]
          created_at: string
          created_by_user_id: string
          display_order: number
          id: string
          organization_id: string
          retired_at: string | null
          rule_definition_id: string
          target_question_id: string | null
          task_blocking: boolean | null
          task_description: string | null
          task_due_in_days: number | null
          task_priority: Database["public"]["Enums"]["priority_level"] | null
          task_required: boolean | null
          task_title: string | null
          updated_at: string
          updated_by_user_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["rule_action_type"]
          created_at?: string
          created_by_user_id: string
          display_order?: number
          id?: string
          organization_id: string
          retired_at?: string | null
          rule_definition_id: string
          target_question_id?: string | null
          task_blocking?: boolean | null
          task_description?: string | null
          task_due_in_days?: number | null
          task_priority?: Database["public"]["Enums"]["priority_level"] | null
          task_required?: boolean | null
          task_title?: string | null
          updated_at?: string
          updated_by_user_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["rule_action_type"]
          created_at?: string
          created_by_user_id?: string
          display_order?: number
          id?: string
          organization_id?: string
          retired_at?: string | null
          rule_definition_id?: string
          target_question_id?: string | null
          task_blocking?: boolean | null
          task_description?: string | null
          task_due_in_days?: number | null
          task_priority?: Database["public"]["Enums"]["priority_level"] | null
          task_required?: boolean | null
          task_title?: string | null
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_actions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_actions_rule_definition_fkey"
            columns: ["organization_id", "rule_definition_id"]
            isOneToOne: false
            referencedRelation: "organization_rule_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_actions_rule_definition_fkey"
            columns: ["organization_id", "rule_definition_id"]
            isOneToOne: false
            referencedRelation: "rule_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_actions_target_question_fkey"
            columns: ["organization_id", "target_question_id"]
            isOneToOne: false
            referencedRelation: "organization_question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_actions_target_question_fkey"
            columns: ["organization_id", "target_question_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_actions_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_definitions: {
        Row: {
          active: boolean
          condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          condition_option_id: string | null
          created_at: string
          created_by_user_id: string
          description: string
          display_order: number
          id: string
          name: string
          organization_id: string
          source_question_id: string
          updated_at: string
          updated_by_user_id: string
        }
        Insert: {
          active?: boolean
          condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          condition_option_id?: string | null
          created_at?: string
          created_by_user_id: string
          description?: string
          display_order?: number
          id?: string
          name: string
          organization_id: string
          source_question_id: string
          updated_at?: string
          updated_by_user_id: string
        }
        Update: {
          active?: boolean
          condition_operator?: Database["public"]["Enums"]["rule_condition_operator"]
          condition_option_id?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string
          display_order?: number
          id?: string
          name?: string
          organization_id?: string
          source_question_id?: string
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_definitions_condition_option_fkey"
            columns: [
              "organization_id",
              "source_question_id",
              "condition_option_id",
            ]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["organization_id", "question_id", "id"]
          },
          {
            foreignKeyName: "rule_definitions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_definitions_source_question_fkey"
            columns: ["organization_id", "source_question_id"]
            isOneToOne: false
            referencedRelation: "organization_question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_definitions_source_question_fkey"
            columns: ["organization_id", "source_question_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_definitions_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_activity: {
        Row: {
          actor_user_id: string | null
          event_type: string
          id: string
          metadata: Json
          new_value: Json | null
          occurred_at: string
          organization_id: string
          previous_value: Json | null
          service_request_id: string
        }
        Insert: {
          actor_user_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          occurred_at?: string
          organization_id: string
          previous_value?: Json | null
          service_request_id: string
        }
        Update: {
          actor_user_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          occurred_at?: string
          organization_id?: string
          previous_value?: Json | null
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_activity_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_activity_organization_id_service_request_i_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "organization_service_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_request_activity_organization_id_service_request_i_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      service_request_communications: {
        Row: {
          actor_user_id: string | null
          channel: string
          communication_type: string
          created_at: string
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_summary: string | null
          id: string
          notification_id: string | null
          organization_id: string
          recipient_email: string | null
          recipient_user_id: string | null
          related_message_id: string | null
          service_request_id: string
          status: string
          subject: string | null
        }
        Insert: {
          actor_user_id?: string | null
          channel: string
          communication_type: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_code?: string | null
          error_summary?: string | null
          id?: string
          notification_id?: string | null
          organization_id: string
          recipient_email?: string | null
          recipient_user_id?: string | null
          related_message_id?: string | null
          service_request_id: string
          status: string
          subject?: string | null
        }
        Update: {
          actor_user_id?: string | null
          channel?: string
          communication_type?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_summary?: string | null
          id?: string
          notification_id?: string | null
          organization_id?: string
          recipient_email?: string | null
          recipient_user_id?: string | null
          related_message_id?: string | null
          service_request_id?: string
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_communications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_communications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_communications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_communications_related_message_id_fkey"
            columns: ["related_message_id"]
            isOneToOne: false
            referencedRelation: "organization_service_request_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_communications_related_message_id_fkey"
            columns: ["related_message_id"]
            isOneToOne: false
            referencedRelation: "service_request_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_communications_request_fk"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "organization_service_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_request_communications_request_fk"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      service_request_messages: {
        Row: {
          author_type: string
          author_user_id: string
          body: string
          created_at: string
          id: string
          organization_id: string
          service_request_id: string
        }
        Insert: {
          author_type: string
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          organization_id: string
          service_request_id: string
        }
        Update: {
          author_type?: string
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          organization_id?: string
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_messages_organization_id_service_request_i_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "organization_service_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_request_messages_organization_id_service_request_i_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      service_requests: {
        Row: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          description: string
          id: string
          last_activity_at: string
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          request_number: string
          requester_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          case_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_id: string
          description?: string
          id?: string
          last_activity_at?: string
          opened_at?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["priority_level"]
          request_number: string
          requester_user_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["service_request_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          case_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_id?: string
          description?: string
          id?: string
          last_activity_at?: string
          opened_at?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          request_number?: string
          requester_user_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["service_request_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_assigned_user_id_fkey"
            columns: ["organization_id", "assigned_user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_customer_id_requester_use_fkey"
            columns: ["organization_id", "customer_id", "requester_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["organization_id", "customer_id", "user_id"]
          },
        ]
      }
      trial_request_status_history: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          prior_status: Database["public"]["Enums"]["trial_request_status"]
          resulting_status: Database["public"]["Enums"]["trial_request_status"]
          review_note: string | null
          trial_request_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          prior_status: Database["public"]["Enums"]["trial_request_status"]
          resulting_status: Database["public"]["Enums"]["trial_request_status"]
          review_note?: string | null
          trial_request_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          prior_status?: Database["public"]["Enums"]["trial_request_status"]
          resulting_status?: Database["public"]["Enums"]["trial_request_status"]
          review_note?: string | null
          trial_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_request_status_history_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_request_status_history_trial_request_id_fkey"
            columns: ["trial_request_id"]
            isOneToOne: false
            referencedRelation: "trial_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_requests: {
        Row: {
          business_email: string
          business_name: string
          contact_name: string
          contacted_at: string | null
          converted_at: string | null
          converted_organization_deleted_id: string | null
          converted_organization_deleted_name: string | null
          converted_organization_deleted_slug: string | null
          converted_organization_id: string | null
          created_at: string
          declined_at: string | null
          estimated_users: number
          id: string
          other_use_case: string | null
          phone: string | null
          primary_use_case: Database["public"]["Enums"]["trial_request_use_case"]
          privacy_acknowledged_at: string
          qualification_notes: string | null
          qualification_reviewed_at: string | null
          qualification_reviewed_by: string | null
          qualified_at: string | null
          request_number: number
          status: Database["public"]["Enums"]["trial_request_status"]
          updated_at: string
          workflow_fit:
            | Database["public"]["Enums"]["trial_request_workflow_fit"]
            | null
          workflow_notes: string | null
        }
        Insert: {
          business_email: string
          business_name: string
          contact_name: string
          contacted_at?: string | null
          converted_at?: string | null
          converted_organization_deleted_id?: string | null
          converted_organization_deleted_name?: string | null
          converted_organization_deleted_slug?: string | null
          converted_organization_id?: string | null
          created_at?: string
          declined_at?: string | null
          estimated_users: number
          id?: string
          other_use_case?: string | null
          phone?: string | null
          primary_use_case: Database["public"]["Enums"]["trial_request_use_case"]
          privacy_acknowledged_at: string
          qualification_notes?: string | null
          qualification_reviewed_at?: string | null
          qualification_reviewed_by?: string | null
          qualified_at?: string | null
          request_number?: never
          status?: Database["public"]["Enums"]["trial_request_status"]
          updated_at?: string
          workflow_fit?:
            | Database["public"]["Enums"]["trial_request_workflow_fit"]
            | null
          workflow_notes?: string | null
        }
        Update: {
          business_email?: string
          business_name?: string
          contact_name?: string
          contacted_at?: string | null
          converted_at?: string | null
          converted_organization_deleted_id?: string | null
          converted_organization_deleted_name?: string | null
          converted_organization_deleted_slug?: string | null
          converted_organization_id?: string | null
          created_at?: string
          declined_at?: string | null
          estimated_users?: number
          id?: string
          other_use_case?: string | null
          phone?: string | null
          primary_use_case?: Database["public"]["Enums"]["trial_request_use_case"]
          privacy_acknowledged_at?: string
          qualification_notes?: string | null
          qualification_reviewed_at?: string | null
          qualification_reviewed_by?: string | null
          qualified_at?: string | null
          request_number?: never
          status?: Database["public"]["Enums"]["trial_request_status"]
          updated_at?: string
          workflow_fit?:
            | Database["public"]["Enums"]["trial_request_workflow_fit"]
            | null
          workflow_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_requests_converted_organization_id_fkey"
            columns: ["converted_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_requests_qualification_reviewed_by_fkey"
            columns: ["qualification_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      case_operational_status: {
        Row: {
          case_number: string | null
          case_type: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          customer_id: string | null
          description: string | null
          due_at: string | null
          id: string | null
          is_overdue: boolean | null
          manager_user_id: string | null
          opened_at: string | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          status: Database["public"]["Enums"]["case_status"] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          case_number?: string | null
          case_type?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string | null
          is_overdue?: never
          manager_user_id?: string | null
          opened_at?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["case_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          case_number?: string | null
          case_type?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string | null
          is_overdue?: never
          manager_user_id?: string | null
          opened_at?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["case_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_organization_id_manager_user_id_fkey"
            columns: ["organization_id", "manager_user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      case_progress: {
        Row: {
          case_id: string | null
          completed_required_tasks: number | null
          organization_id: string | null
          percentage: number | null
          remaining_required_tasks: number | null
          total_required_tasks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_case_activity: {
        Row: {
          actor_display_name: string | null
          actor_user_id: string | null
          case_id: string | null
          created_at: string | null
          event_data: Json | null
          event_type: string | null
          id: string | null
          organization_id: string | null
        }
        Insert: {
          actor_display_name?: never
          actor_user_id?: never
          case_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type?: string | null
          id?: string | null
          organization_id?: string | null
        }
        Update: {
          actor_display_name?: never
          actor_user_id?: never
          case_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type?: string | null
          id?: string | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_activity_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_activity_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "case_activity_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_activity_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_case_tasks: {
        Row: {
          assigned_user_id: string | null
          blocking: boolean | null
          case_id: string | null
          completed_at: string | null
          completed_by_display_name: string | null
          completed_by_user_id: string | null
          created_at: string | null
          created_by_display_name: string | null
          created_by_user_id: string | null
          description: string | null
          due_at: string | null
          generated_by_intake: boolean | null
          generated_by_rule: boolean | null
          id: string | null
          intake_question_definition_id: string | null
          intake_requirement_context: Json | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          required: boolean | null
          sequence: number | null
          status: Database["public"]["Enums"]["case_task_status"] | null
          task_purpose_id: string | null
          task_purpose_label: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_tasks_intake_question_fkey"
            columns: ["organization_id", "intake_question_definition_id"]
            isOneToOne: false
            referencedRelation: "organization_question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_intake_question_fkey"
            columns: ["organization_id", "intake_question_definition_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_assigned_user_id_fkey"
            columns: ["organization_id", "assigned_user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "case_tasks_task_purpose_fkey"
            columns: ["organization_id", "task_purpose_id"]
            isOneToOne: false
            referencedRelation: "organization_task_purposes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_cases: {
        Row: {
          case_number: string | null
          case_title_id: string | null
          case_type: string | null
          case_type_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by_display_name: string | null
          created_by_user_id: string | null
          customer_id: string | null
          description: string | null
          due_at: string | null
          id: string | null
          manager_user_id: string | null
          opened_at: string | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          status: Database["public"]["Enums"]["case_status"] | null
          tax_outcome: string | null
          tax_year: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          case_number?: string | null
          case_title_id?: string | null
          case_type?: string | null
          case_type_id?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string | null
          manager_user_id?: string | null
          opened_at?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["case_status"] | null
          tax_outcome?: string | null
          tax_year?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          case_number?: string | null
          case_title_id?: string | null
          case_type?: string | null
          case_type_id?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string | null
          manager_user_id?: string | null
          opened_at?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["case_status"] | null
          tax_outcome?: string | null
          tax_year?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_case_title_identity_fkey"
            columns: ["organization_id", "case_title_id"]
            isOneToOne: false
            referencedRelation: "organization_case_titles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_case_type_identity_fkey"
            columns: ["organization_id", "case_type_id"]
            isOneToOne: false
            referencedRelation: "organization_case_types"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_organization_id_manager_user_id_fkey"
            columns: ["organization_id", "manager_user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      organization_customers: {
        Row: {
          city: string | null
          created_at: string | null
          created_by_display_name: string | null
          created_by_user_id: string | null
          customer_number: string | null
          email: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          name: string | null
          notes: string | null
          organization_id: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          status: Database["public"]["Enums"]["customer_status"] | null
          street_address: string | null
          type: Database["public"]["Enums"]["customer_type"] | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          customer_number?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          name?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"] | null
          street_address?: string | null
          type?: Database["public"]["Enums"]["customer_type"] | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          customer_number?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          name?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"] | null
          street_address?: string | null
          type?: Database["public"]["Enums"]["customer_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_question_definitions: {
        Row: {
          active: boolean | null
          completion_condition: string | null
          created_at: string | null
          created_by_display_name: string | null
          created_by_user_id: string | null
          description: string | null
          display_order: number | null
          id: string | null
          organization_id: string | null
          question_group: string | null
          question_text: string | null
          require_all_options: boolean | null
          required: boolean | null
          response_type:
            | Database["public"]["Enums"]["question_response_type"]
            | null
          track_required_options: boolean | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          completion_condition?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          description?: string | null
          display_order?: number | null
          id?: string | null
          organization_id?: string | null
          question_group?: string | null
          question_text?: string | null
          require_all_options?: boolean | null
          required?: boolean | null
          response_type?:
            | Database["public"]["Enums"]["question_response_type"]
            | null
          track_required_options?: boolean | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          completion_condition?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          description?: string | null
          display_order?: number | null
          id?: string | null
          organization_id?: string | null
          question_group?: string | null
          question_text?: string | null
          require_all_options?: boolean | null
          required?: boolean | null
          response_type?:
            | Database["public"]["Enums"]["question_response_type"]
            | null
          track_required_options?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_rule_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["rule_action_type"] | null
          created_at: string | null
          created_by_display_name: string | null
          created_by_user_id: string | null
          display_order: number | null
          id: string | null
          organization_id: string | null
          rule_definition_id: string | null
          target_question_id: string | null
          task_blocking: boolean | null
          task_description: string | null
          task_due_in_days: number | null
          task_priority: Database["public"]["Enums"]["priority_level"] | null
          task_required: boolean | null
          task_title: string | null
          updated_at: string | null
          updated_by_display_name: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          action_type?: Database["public"]["Enums"]["rule_action_type"] | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          display_order?: number | null
          id?: string | null
          organization_id?: string | null
          rule_definition_id?: string | null
          target_question_id?: string | null
          task_blocking?: boolean | null
          task_description?: string | null
          task_due_in_days?: number | null
          task_priority?: Database["public"]["Enums"]["priority_level"] | null
          task_required?: boolean | null
          task_title?: string | null
          updated_at?: string | null
          updated_by_display_name?: never
          updated_by_user_id?: never
        }
        Update: {
          action_type?: Database["public"]["Enums"]["rule_action_type"] | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          display_order?: number | null
          id?: string | null
          organization_id?: string | null
          rule_definition_id?: string | null
          target_question_id?: string | null
          task_blocking?: boolean | null
          task_description?: string | null
          task_due_in_days?: number | null
          task_priority?: Database["public"]["Enums"]["priority_level"] | null
          task_required?: boolean | null
          task_title?: string | null
          updated_at?: string | null
          updated_by_display_name?: never
          updated_by_user_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "rule_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_actions_rule_definition_fkey"
            columns: ["organization_id", "rule_definition_id"]
            isOneToOne: false
            referencedRelation: "organization_rule_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_actions_rule_definition_fkey"
            columns: ["organization_id", "rule_definition_id"]
            isOneToOne: false
            referencedRelation: "rule_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_actions_target_question_fkey"
            columns: ["organization_id", "target_question_id"]
            isOneToOne: false
            referencedRelation: "organization_question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_actions_target_question_fkey"
            columns: ["organization_id", "target_question_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_rule_definitions: {
        Row: {
          active: boolean | null
          condition_operator:
            | Database["public"]["Enums"]["rule_condition_operator"]
            | null
          condition_option_id: string | null
          created_at: string | null
          created_by_display_name: string | null
          created_by_user_id: string | null
          description: string | null
          display_order: number | null
          id: string | null
          name: string | null
          organization_id: string | null
          source_question_id: string | null
          updated_at: string | null
          updated_by_display_name: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          active?: boolean | null
          condition_operator?:
            | Database["public"]["Enums"]["rule_condition_operator"]
            | null
          condition_option_id?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          description?: string | null
          display_order?: number | null
          id?: string | null
          name?: string | null
          organization_id?: string | null
          source_question_id?: string | null
          updated_at?: string | null
          updated_by_display_name?: never
          updated_by_user_id?: never
        }
        Update: {
          active?: boolean | null
          condition_operator?:
            | Database["public"]["Enums"]["rule_condition_operator"]
            | null
          condition_option_id?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          description?: string | null
          display_order?: number | null
          id?: string | null
          name?: string | null
          organization_id?: string | null
          source_question_id?: string | null
          updated_at?: string | null
          updated_by_display_name?: never
          updated_by_user_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "rule_definitions_condition_option_fkey"
            columns: [
              "organization_id",
              "source_question_id",
              "condition_option_id",
            ]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["organization_id", "question_id", "id"]
          },
          {
            foreignKeyName: "rule_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_definitions_source_question_fkey"
            columns: ["organization_id", "source_question_id"]
            isOneToOne: false
            referencedRelation: "organization_question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_definitions_source_question_fkey"
            columns: ["organization_id", "source_question_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_service_request_activity: {
        Row: {
          actor_display_name: string | null
          actor_user_id: string | null
          event_type: string | null
          id: string | null
          metadata: Json | null
          new_value: Json | null
          occurred_at: string | null
          organization_id: string | null
          previous_value: Json | null
          service_request_id: string | null
        }
        Insert: {
          actor_display_name?: never
          actor_user_id?: never
          event_type?: string | null
          id?: string | null
          metadata?: Json | null
          new_value?: Json | null
          occurred_at?: string | null
          organization_id?: string | null
          previous_value?: Json | null
          service_request_id?: string | null
        }
        Update: {
          actor_display_name?: never
          actor_user_id?: never
          event_type?: string | null
          id?: string | null
          metadata?: Json | null
          new_value?: Json | null
          occurred_at?: string | null
          organization_id?: string | null
          previous_value?: Json | null
          service_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_activity_organization_id_service_request_i_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "organization_service_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_request_activity_organization_id_service_request_i_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_service_request_communications: {
        Row: {
          actor_display_name: string | null
          actor_user_id: string | null
          channel: string | null
          communication_type: string | null
          created_at: string | null
          delivered_at: string | null
          direction: string | null
          error_code: string | null
          error_summary: string | null
          id: string | null
          organization_id: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          related_message_id: string | null
          service_request_id: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          actor_display_name?: never
          actor_user_id?: never
          channel?: string | null
          communication_type?: string | null
          created_at?: string | null
          delivered_at?: string | null
          direction?: string | null
          error_code?: string | null
          error_summary?: string | null
          id?: string | null
          organization_id?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          related_message_id?: string | null
          service_request_id?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          actor_display_name?: never
          actor_user_id?: never
          channel?: string | null
          communication_type?: string | null
          created_at?: string | null
          delivered_at?: string | null
          direction?: string | null
          error_code?: string | null
          error_summary?: string | null
          id?: string | null
          organization_id?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          related_message_id?: string | null
          service_request_id?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_communications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_communications_related_message_id_fkey"
            columns: ["related_message_id"]
            isOneToOne: false
            referencedRelation: "organization_service_request_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_communications_related_message_id_fkey"
            columns: ["related_message_id"]
            isOneToOne: false
            referencedRelation: "service_request_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_communications_request_fk"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "organization_service_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_request_communications_request_fk"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_service_request_messages: {
        Row: {
          author_display_name: string | null
          author_type: string | null
          author_user_id: string | null
          body: string | null
          created_at: string | null
          id: string | null
          organization_id: string | null
          service_request_id: string | null
        }
        Insert: {
          author_display_name?: never
          author_type?: string | null
          author_user_id?: never
          body?: string | null
          created_at?: string | null
          id?: string | null
          organization_id?: string | null
          service_request_id?: string | null
        }
        Update: {
          author_display_name?: never
          author_type?: string | null
          author_user_id?: never
          body?: string | null
          created_at?: string | null
          id?: string | null
          organization_id?: string | null
          service_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_messages_organization_id_service_request_i_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "organization_service_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_request_messages_organization_id_service_request_i_fkey"
            columns: ["organization_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_service_requests: {
        Row: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string | null
          created_by_display_name: string | null
          created_by_user_id: string | null
          customer_id: string | null
          description: string | null
          id: string | null
          last_activity_at: string | null
          opened_at: string | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          request_number: string | null
          requester_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["service_request_status"] | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          case_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          customer_id?: string | null
          description?: string | null
          id?: string | null
          last_activity_at?: string | null
          opened_at?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          request_number?: string | null
          requester_user_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["service_request_status"] | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          case_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          created_by_display_name?: never
          created_by_user_id?: never
          customer_id?: string | null
          description?: string | null
          id?: string | null
          last_activity_at?: string | null
          opened_at?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          request_number?: string | null
          requester_user_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["service_request_status"] | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_organization_id_assigned_user_id_fkey"
            columns: ["organization_id", "assigned_user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_status"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "case_progress"
            referencedColumns: ["organization_id", "case_id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_case_id_fkey"
            columns: ["organization_id", "case_id"]
            isOneToOne: false
            referencedRelation: "organization_cases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "organization_customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_customer_id_requester_use_fkey"
            columns: ["organization_id", "customer_id", "requester_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["organization_id", "customer_id", "user_id"]
          },
        ]
      }
    }
    Functions: {
      admin_set_organization_license: {
        Args: {
          target_commercial_state: Database["public"]["Enums"]["commercial_state"]
          target_event_type?: Database["public"]["Enums"]["license_event_type"]
          target_expires_at: string
          target_grace_ends_at: string
          target_notes: string
          target_organization_id: string
          target_plan_code: string
          target_starts_at: string
          target_status: Database["public"]["Enums"]["license_status"]
        }
        Returns: {
          commercial_state: Database["public"]["Enums"]["commercial_state"]
          created_at: string
          created_by: string | null
          expires_at: string | null
          grace_ends_at: string | null
          id: string
          is_current: boolean
          license_status: Database["public"]["Enums"]["license_status"]
          notes: string | null
          notice_days: number
          notification_thresholds: number[]
          organization_id: string
          plan_code: string
          starts_at: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "organization_licenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      allocate_service_request_number: {
        Args: { target_organization_id: string }
        Returns: string
      }
      apply_configuration_template: {
        Args: { target_organization_id: string; target_template_id: string }
        Returns: {
          applied_at: string
          applied_by_user_id: string
          configuration_template_id: string
          id: string
          organization_id: string
          template_version: number
        }
        SetofOptions: {
          from: "*"
          to: "organization_configuration_template_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_notification: {
        Args: { target_notification_id: string }
        Returns: {
          archived_at: string | null
          category: string
          created_at: string
          destination_path: string
          id: string
          message: string
          notification_type: string
          organization_id: string
          read_at: string | null
          recipient_user_id: string
          source_domain: string
          source_entity_id: string
          source_event_id: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_rule_graph_acyclic: {
        Args: { target_organization_id: string }
        Returns: undefined
      }
      can_access_case: {
        Args: {
          check_case_id: string
          check_organization_id: string
          check_user_id?: string
        }
        Returns: boolean
      }
      can_access_service_request: {
        Args: {
          target_organization_id: string
          target_service_request_id: string
          target_user_id?: string
        }
        Returns: boolean
      }
      can_administer_questions: {
        Args: { target_organization_id: string; target_user_id?: string }
        Returns: boolean
      }
      can_manage_case: {
        Args: { target_organization_id: string; target_user_id?: string }
        Returns: boolean
      }
      can_manage_own_service_request: {
        Args: {
          target_organization_id: string
          target_service_request_id: string
        }
        Returns: boolean
      }
      can_manage_service_request: {
        Args: {
          target_organization_id: string
          target_service_request_id: string
          target_user_id?: string
        }
        Returns: boolean
      }
      can_read_service_request_messages: {
        Args: {
          target_organization_id: string
          target_service_request_id: string
        }
        Returns: boolean
      }
      can_view_organization_actor: {
        Args: { target_actor: string }
        Returns: boolean
      }
      capture_configuration_template: {
        Args: {
          target_description?: string
          target_name: string
          target_source_organization_id: string
          target_status?: string
        }
        Returns: {
          created_at: string
          created_by_user_id: string
          description: string | null
          id: string
          name: string
          source_organization_id: string | null
          status: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "configuration_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_case: {
        Args: { target_case_id: string; target_tax_outcome: string }
        Returns: {
          case_number: string
          case_title_id: string | null
          case_type: string
          case_type_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          intake_submission_key: string | null
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
          tax_outcome: string | null
          tax_year: number | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_organization_reset_identity_cleanup: {
        Args: {
          deleted_user_ids: string[]
          failed_user_ids: string[]
          retained_user_ids: string[]
          target_reset_audit_id: string
        }
        Returns: undefined
      }
      complete_permanent_organization_deletion_cleanup: {
        Args: {
          deleted_user_ids: string[]
          failed_user_ids: string[]
          retained_user_ids: string[]
          storage_deleted_paths: string[]
          storage_failed_paths: string[]
          storage_status: string
          target_deletion_audit_id: string
        }
        Returns: Json
      }
      convert_trial_request_to_organization: {
        Args: {
          target_conversion_note: string
          target_organization_name: string
          target_organization_slug: string
          target_owner_email: string
          target_owner_identity_verified: boolean
          target_owner_user_id: string
          target_trial_request_id: string
        }
        Returns: {
          avatar_path: string | null
          avatar_updated_at: string | null
          business_postal_code: string | null
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      convert_trial_request_to_organization_with_configuration_templa: {
        Args: {
          target_conversion_note: string
          target_organization_name: string
          target_organization_slug: string
          target_owner_email: string
          target_owner_identity_verified: boolean
          target_owner_user_id: string
          target_template_id?: string
          target_trial_request_id: string
        }
        Returns: {
          avatar_path: string | null
          avatar_updated_at: string | null
          business_postal_code: string | null
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_case_task:
        | {
            Args: {
              target_assigned_user_id?: string
              target_blocking?: boolean
              target_case_id: string
              target_description?: string
              target_due_date?: string
              target_priority?: Database["public"]["Enums"]["priority_level"]
              target_required?: boolean
              target_task_purpose_id: string
              target_title: string
            }
            Returns: {
              assigned_user_id: string | null
              blocking: boolean
              case_id: string
              completed_at: string | null
              completed_by_user_id: string | null
              created_at: string
              created_by_user_id: string
              description: string
              due_at: string | null
              id: string
              intake_follow_up_id: string | null
              intake_question_definition_id: string | null
              intake_requirement_context: Json | null
              organization_id: string
              prior_actionable_status:
                | Database["public"]["Enums"]["case_task_status"]
                | null
              priority: Database["public"]["Enums"]["priority_level"]
              required: boolean
              sequence: number
              source_rule_action_id: string | null
              source_rule_id: string | null
              status: Database["public"]["Enums"]["case_task_status"]
              task_purpose_id: string | null
              title: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "case_tasks"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              target_assigned_user_id?: string
              target_blocking?: boolean
              target_case_id: string
              target_description?: string
              target_due_date?: string
              target_priority?: Database["public"]["Enums"]["priority_level"]
              target_required?: boolean
              target_title: string
            }
            Returns: {
              assigned_user_id: string | null
              blocking: boolean
              case_id: string
              completed_at: string | null
              completed_by_user_id: string | null
              created_at: string
              created_by_user_id: string
              description: string
              due_at: string | null
              id: string
              intake_follow_up_id: string | null
              intake_question_definition_id: string | null
              intake_requirement_context: Json | null
              organization_id: string
              prior_actionable_status:
                | Database["public"]["Enums"]["case_task_status"]
                | null
              priority: Database["public"]["Enums"]["priority_level"]
              required: boolean
              sequence: number
              source_rule_action_id: string | null
              source_rule_id: string | null
              status: Database["public"]["Enums"]["case_task_status"]
              task_purpose_id: string | null
              title: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "case_tasks"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_case_workflow: {
        Args: {
          target_case_type: string
          target_customer_id: string
          target_description: string
          target_due_at?: string
          target_initial_tasks?: Json
          target_manager_user_id?: string
          target_organization_id: string
          target_priority: Database["public"]["Enums"]["priority_level"]
          target_staff_user_ids?: string[]
          target_tax_year: number
          target_title: string
        }
        Returns: {
          case_number: string
          case_title_id: string | null
          case_type: string
          case_type_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          intake_submission_key: string | null
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
          tax_outcome: string | null
          tax_year: number | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_customer_record:
        | {
            Args: {
              target_email?: string
              target_name: string
              target_notes?: string
              target_organization_id: string
              target_phone?: string
              target_type: Database["public"]["Enums"]["customer_type"]
            }
            Returns: {
              city: string | null
              created_at: string
              created_by_user_id: string | null
              customer_number: string
              email: string | null
              first_name: string | null
              id: string
              last_name: string | null
              name: string
              notes: string | null
              organization_id: string
              phone: string | null
              postal_code: string | null
              state: string | null
              status: Database["public"]["Enums"]["customer_status"]
              street_address: string | null
              type: Database["public"]["Enums"]["customer_type"]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "customers"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              target_city: string
              target_email: string
              target_first_name: string
              target_last_name: string
              target_name: string
              target_notes: string
              target_organization_id: string
              target_phone: string
              target_postal_code: string
              target_state: string
              target_street_address: string
              target_type: Database["public"]["Enums"]["customer_type"]
            }
            Returns: {
              city: string | null
              created_at: string
              created_by_user_id: string | null
              customer_number: string
              email: string | null
              first_name: string | null
              id: string
              last_name: string | null
              name: string
              notes: string | null
              organization_id: string
              phone: string | null
              postal_code: string | null
              state: string | null
              status: Database["public"]["Enums"]["customer_status"]
              street_address: string | null
              type: Database["public"]["Enums"]["customer_type"]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "customers"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_customer_service_request: {
        Args: {
          target_description: string
          target_portal_access_id: string
          target_subject: string
        }
        Returns: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          description: string
          id: string
          last_activity_at: string
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          request_number: string
          requester_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_customer_service_request_message: {
        Args: { target_body: string; target_service_request_id: string }
        Returns: {
          author_type: string
          author_user_id: string
          body: string
          created_at: string
          id: string
          organization_id: string
          service_request_id: string
        }
        SetofOptions: {
          from: "*"
          to: "service_request_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_guided_case_intake:
        | {
            Args: {
              target_answers?: Json
              target_case_title_id: string
              target_case_type_id: string
              target_customer_id: string
              target_description: string
              target_follow_up_tasks?: Json
              target_manager_user_id?: string
              target_organization_id: string
              target_priority: Database["public"]["Enums"]["priority_level"]
              target_staff_user_ids?: string[]
              target_submission_key: string
              target_tax_year: number
            }
            Returns: {
              case_number: string
              case_title_id: string | null
              case_type: string
              case_type_id: string | null
              closed_at: string | null
              completed_at: string | null
              created_at: string
              created_by_user_id: string
              customer_id: string
              description: string
              due_at: string | null
              id: string
              intake_submission_key: string | null
              manager_user_id: string | null
              opened_at: string
              organization_id: string
              priority: Database["public"]["Enums"]["priority_level"]
              status: Database["public"]["Enums"]["case_status"]
              tax_outcome: string | null
              tax_year: number | null
              title: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "cases"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              target_answers?: Json
              target_case_title_id: string
              target_case_type_id: string
              target_customer_id: string
              target_description: string
              target_follow_up_tasks?: Json
              target_manager_user_id?: string
              target_organization_id: string
              target_portal_onboarding?: Json
              target_priority: Database["public"]["Enums"]["priority_level"]
              target_required_option_ids?: Json
              target_staff_user_ids?: string[]
              target_submission_key: string
              target_tax_year: number
            }
            Returns: {
              case_number: string
              case_title_id: string | null
              case_type: string
              case_type_id: string | null
              closed_at: string | null
              completed_at: string | null
              created_at: string
              created_by_user_id: string
              customer_id: string
              description: string
              due_at: string | null
              id: string
              intake_submission_key: string | null
              manager_user_id: string | null
              opened_at: string
              organization_id: string
              priority: Database["public"]["Enums"]["priority_level"]
              status: Database["public"]["Enums"]["case_status"]
              tax_outcome: string | null
              tax_year: number | null
              title: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "cases"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              target_answers?: Json
              target_case_type_id: string
              target_customer_id: string
              target_customer_mode: string
              target_description: string
              target_follow_up_tasks?: Json
              target_manager_user_id?: string
              target_organization_id: string
              target_priority: Database["public"]["Enums"]["priority_level"]
              target_staff_user_ids?: string[]
              target_submission_key: string
              target_tax_year: number
            }
            Returns: {
              case_number: string
              case_title_id: string | null
              case_type: string
              case_type_id: string | null
              closed_at: string | null
              completed_at: string | null
              created_at: string
              created_by_user_id: string
              customer_id: string
              description: string
              due_at: string | null
              id: string
              intake_submission_key: string | null
              manager_user_id: string | null
              opened_at: string
              organization_id: string
              priority: Database["public"]["Enums"]["priority_level"]
              status: Database["public"]["Enums"]["case_status"]
              tax_outcome: string | null
              tax_year: number | null
              title: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "cases"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              target_answers: Json
              target_case_type_id: string
              target_customer_id: string
              target_customer_mode: string
              target_description: string
              target_follow_up_tasks: Json
              target_manager_user_id: string
              target_organization_id: string
              target_portal_onboarding: Json
              target_priority: Database["public"]["Enums"]["priority_level"]
              target_staff_user_ids: string[]
              target_submission_key: string
              target_tax_year: number
            }
            Returns: {
              case_number: string
              case_title_id: string | null
              case_type: string
              case_type_id: string | null
              closed_at: string | null
              completed_at: string | null
              created_at: string
              created_by_user_id: string
              customer_id: string
              description: string
              due_at: string | null
              id: string
              intake_submission_key: string | null
              manager_user_id: string | null
              opened_at: string
              organization_id: string
              priority: Database["public"]["Enums"]["priority_level"]
              status: Database["public"]["Enums"]["case_status"]
              tax_outcome: string | null
              tax_year: number | null
              title: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "cases"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_internal_service_request_message: {
        Args: { target_body: string; target_service_request_id: string }
        Returns: {
          author_type: string
          author_user_id: string
          body: string
          created_at: string
          id: string
          organization_id: string
          service_request_id: string
        }
        SetofOptions: {
          from: "*"
          to: "service_request_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_notification: {
        Args: {
          target_category: string
          target_destination_path: string
          target_message: string
          target_notification_type: string
          target_organization_id: string
          target_recipient_user_id: string
          target_source_domain: string
          target_source_entity_id: string
          target_source_event_id: string
          target_title: string
        }
        Returns: {
          archived_at: string | null
          category: string
          created_at: string
          destination_path: string
          id: string
          message: string
          notification_type: string
          organization_id: string
          read_at: string | null
          recipient_user_id: string
          source_domain: string
          source_entity_id: string
          source_event_id: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organization: {
        Args: { target_name: string; target_slug: string }
        Returns: {
          avatar_path: string | null
          avatar_updated_at: string | null
          business_postal_code: string | null
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organization_with_configuration_template: {
        Args: {
          target_name: string
          target_slug: string
          target_template_id?: string
        }
        Returns: {
          avatar_path: string | null
          avatar_updated_at: string | null
          business_postal_code: string | null
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_service_request: {
        Args: {
          target_assigned_user_id?: string
          target_customer_id: string
          target_description: string
          target_organization_id: string
          target_priority?: Database["public"]["Enums"]["priority_level"]
          target_subject: string
        }
        Returns: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          description: string
          id: string
          last_activity_at: string
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          request_number: string
          requester_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      default_organization_role_permission: {
        Args: {
          target_permission: string
          target_role: Database["public"]["Enums"]["application_role"]
        }
        Returns: boolean
      }
      delete_case_task: { Args: { target_task_id: string }; Returns: undefined }
      delete_platform_communication: {
        Args: {
          target_organization_id: string
          target_reason?: string
          target_record_id: string
          target_record_kind: string
        }
        Returns: Json
      }
      effective_organization_role_permission: {
        Args: {
          target_organization_id: string
          target_permission: string
          target_role: Database["public"]["Enums"]["application_role"]
        }
        Returns: boolean
      }
      email_template_content_is_safe: {
        Args: { target_content: string; target_template_key: string }
        Returns: boolean
      }
      finalize_guided_case_intake: {
        Args: {
          target_answers: Json
          target_case_type_id: string
          target_customer_id: string
          target_customer_mode: string
          target_description: string
          target_follow_up_tasks: Json
          target_manager_user_id: string
          target_organization_id: string
          target_portal_onboarding: Json
          target_priority: Database["public"]["Enums"]["priority_level"]
          target_staff_user_ids: string[]
          target_submission_key: string
          target_tax_year: number
        }
        Returns: {
          case_number: string
          case_title_id: string | null
          case_type: string
          case_type_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          intake_submission_key: string | null
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
          tax_outcome: string | null
          tax_year: number | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_case_progress: {
        Args: { target_case_id: string }
        Returns: {
          completed_required_tasks: number
          percentage: number
          remaining_required_tasks: number
          total_required_tasks: number
        }[]
      }
      get_customer_portal_case_requirements: {
        Args: { target_portal_access_id: string }
        Returns: {
          case_number: string
          missing_documents: Json
          reported_sent_at: string
          task_id: string
        }[]
      }
      get_customer_portal_cases: {
        Args: { target_portal_access_id: string }
        Returns: {
          case_number: string
          customer_status: string
          intake_finalized: boolean
          progress_percent: number
          service_label: string
          tax_outcome: string
        }[]
      }
      get_my_access_context: {
        Args: { target_organization_id?: string }
        Returns: Json
      }
      get_my_pending_organization_membership: {
        Args: never
        Returns: {
          membership_id: string
          organization_id: string
          organization_name: string
          status: Database["public"]["Enums"]["organization_membership_status"]
        }[]
      }
      get_my_route_access_state: {
        Args: never
        Returns: {
          has_active_customer_portal_access: boolean
          has_active_organization_access: boolean
          has_active_super_admin_access: boolean
          has_pending_organization_membership: boolean
          profile_active: boolean
        }[]
      }
      get_my_unread_notification_count: {
        Args: { target_organization_id: string }
        Returns: number
      }
      get_organization_email_delivery_audit: {
        Args: {
          created_after?: string
          search_text?: string
          target_organization_id: string
        }
        Returns: {
          activity_at: string
          case_id: string
          customer_id: string
          delivery_status: string
          error_summary: string
          failed_at: string
          id: string
          membership_id: string
          opened_at: string
          organization_id: string
          recipient_email: string
          recipient_user_id: string
          sent_at: string
          service_request_id: string
          subject: string
          template_key: string
        }[]
      }
      get_platform_analytics: {
        Args: { target_end_exclusive: string; target_start: string }
        Returns: Json
      }
      get_platform_operational_actor_audit: {
        Args: { target_organization_id: string }
        Returns: {
          actor_column: string
          actor_user_id: string
          record_id: string
          source_table: string
        }[]
      }
      get_published_configuration_templates: {
        Args: never
        Returns: {
          description: string
          id: string
          name: string
          version: number
        }[]
      }
      get_service_request_detail_activity: {
        Args: { target_service_request_id: string }
        Returns: {
          activity_id: string
          actor_display_name: string
          actor_email: string
          actor_user_id: string
          created_by_user_id: string
          creator_display_name: string
          creator_email: string
          event_type: string
          metadata: Json
          new_value: Json
          occurred_at: string
          previous_value: Json
        }[]
      }
      guided_intake_case_identity_matches: {
        Args: {
          target_case_id: string
          target_case_type_id: string
          target_customer_id: string
          target_organization_id: string
          target_tax_year: number
        }
        Returns: boolean
      }
      guided_intake_response_complete: {
        Args: {
          target_organization_id: string
          target_question_id: string
          target_response_type: Database["public"]["Enums"]["question_response_type"]
          target_value: Json
        }
        Returns: boolean
      }
      guided_intake_response_valid: {
        Args: {
          target_organization_id: string
          target_question_id: string
          target_response_type: Database["public"]["Enums"]["question_response_type"]
          target_value: Json
        }
        Returns: boolean
      }
      guided_intake_rule_matches: {
        Args: {
          condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          condition_option_id: string
          source_question_id: string
          target_answers: Json
          target_organization_id: string
        }
        Returns: boolean
      }
      has_effective_organization_permission: {
        Args: { target_organization_id: string; target_permission: string }
        Returns: boolean
      }
      has_organization_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["application_role"][]
          check_organization_id: string
          check_user_id?: string
        }
        Returns: boolean
      }
      is_customer_portal_user: {
        Args: {
          check_customer_id: string
          check_organization_id: string
          check_user_id?: string
        }
        Returns: boolean
      }
      is_internal_member: {
        Args: { check_organization_id: string; check_user_id?: string }
        Returns: boolean
      }
      is_known_customer_foreign_key: {
        Args: { target_constraint_oid: unknown }
        Returns: boolean
      }
      is_super_admin: { Args: { check_user_id?: string }; Returns: boolean }
      is_valid_organization_actor: {
        Args: { target_organization_id: string; target_user_id: string }
        Returns: boolean
      }
      mark_all_notifications_read: {
        Args: { target_organization_id: string }
        Returns: number
      }
      mark_intake_requirement_notice_sent: {
        Args: { target_task_id: string }
        Returns: {
          assigned_user_id: string | null
          blocking: boolean
          case_id: string
          completed_at: string | null
          completed_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          description: string
          due_at: string | null
          id: string
          intake_follow_up_id: string | null
          intake_question_definition_id: string | null
          intake_requirement_context: Json | null
          organization_id: string
          prior_actionable_status:
            | Database["public"]["Enums"]["case_task_status"]
            | null
          priority: Database["public"]["Enums"]["priority_level"]
          required: boolean
          sequence: number
          source_rule_action_id: string | null
          source_rule_id: string | null
          status: Database["public"]["Enums"]["case_task_status"]
          task_purpose_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "case_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      materialize_guided_case_intake: {
        Args: {
          target_case_type_id: string
          target_customer_id: string
          target_customer_mode: string
          target_description: string
          target_manager_user_id?: string
          target_organization_id: string
          target_priority: Database["public"]["Enums"]["priority_level"]
          target_staff_user_ids?: string[]
          target_submission_key: string
          target_tax_year: number
        }
        Returns: {
          case_number: string
          case_title_id: string | null
          case_type: string
          case_type_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          intake_submission_key: string | null
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
          tax_outcome: string | null
          tax_year: number | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_case_task: {
        Args: { target_direction: string; target_task_id: string }
        Returns: undefined
      }
      next_case_number: {
        Args: { target_organization_id: string }
        Returns: string
      }
      next_customer_number:
        | { Args: { target_organization_id: string }; Returns: string }
        | {
            Args: {
              target_organization_id: string
              target_type: Database["public"]["Enums"]["customer_type"]
            }
            Returns: string
          }
      organization_actor_id: { Args: { target_actor: string }; Returns: string }
      organization_actor_label: {
        Args: { target_actor: string }
        Returns: string
      }
      organization_end_of_date: {
        Args: { target_date: string; target_organization_id: string }
        Returns: string
      }
      organization_member_has_active_responsibility: {
        Args: { target_membership_id: string }
        Returns: boolean
      }
      organization_task_due_at: {
        Args: { target_due_in_days: number; target_organization_id: string }
        Returns: string
      }
      permanently_delete_organization: {
        Args: { confirmation: string; target_organization_id: string }
        Returns: Json
      }
      permanently_delete_organization_cases: {
        Args: {
          confirmation_text: string
          target_case_ids: string[]
          target_organization_id: string
        }
        Returns: Json
      }
      permanently_delete_organization_without_email_deliveries: {
        Args: { confirmation: string; target_organization_id: string }
        Returns: Json
      }
      permanently_delete_trial_request: {
        Args: { confirmation_text: string; target_trial_request_id: string }
        Returns: Json
      }
      preview_organization_case_deletion: {
        Args: { target_case_ids: string[]; target_organization_id: string }
        Returns: Json
      }
      preview_organization_reset: {
        Args: {
          preserved_owner_user_id: string
          target_organization_id: string
        }
        Returns: Json
      }
      preview_organization_reset_without_customer_import_submissions: {
        Args: {
          preserved_owner_user_id: string
          target_organization_id: string
        }
        Returns: Json
      }
      preview_organization_reset_without_email_deliveries: {
        Args: {
          preserved_owner_user_id: string
          target_organization_id: string
        }
        Returns: Json
      }
      preview_permanent_organization_deletion: {
        Args: { target_organization_id: string }
        Returns: Json
      }
      preview_permanent_organization_deletion_without_email_deliverie: {
        Args: { target_organization_id: string }
        Returns: Json
      }
      provision_organization_member:
        | {
            Args: {
              target_email: string
              target_organization_id: string
              target_role: Database["public"]["Enums"]["application_role"]
            }
            Returns: {
              activated_at: string | null
              created_at: string
              id: string
              invited_at: string | null
              is_active: boolean
              joined_at: string
              organization_id: string
              revoked_at: string | null
              role: Database["public"]["Enums"]["application_role"]
              status: Database["public"]["Enums"]["organization_membership_status"]
              suspended_at: string | null
              updated_at: string
              user_id: string
              verified_at: string | null
            }
            SetofOptions: {
              from: "*"
              to: "organization_members"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              target_email: string
              target_identity_verified?: boolean
              target_organization_id: string
              target_role: Database["public"]["Enums"]["application_role"]
            }
            Returns: {
              activated_at: string | null
              created_at: string
              id: string
              invited_at: string | null
              is_active: boolean
              joined_at: string
              organization_id: string
              revoked_at: string | null
              role: Database["public"]["Enums"]["application_role"]
              status: Database["public"]["Enums"]["organization_membership_status"]
              suspended_at: string | null
              updated_at: string
              user_id: string
              verified_at: string | null
            }
            SetofOptions: {
              from: "*"
              to: "organization_members"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      publish_public_landing_page: {
        Args: never
        Returns: {
          version: number
          version_id: string
        }[]
      }
      reassign_case_customer: {
        Args: { target_case_id: string; target_customer_id: string }
        Returns: undefined
      }
      reassign_revoked_member_work: {
        Args: {
          replacement_user_id: string
          target_membership_id: string
          target_work_type: string
        }
        Returns: Json
      }
      record_organization_membership_invitation_event: {
        Args: { target_event_type: string; target_membership_id: string }
        Returns: undefined
      }
      report_customer_case_documents_sent: {
        Args: { target_portal_access_id: string; target_task_id: string }
        Returns: {
          case_number: string
          confirmation_id: string
          reported_sent_at: string
          task_id: string
        }[]
      }
      reset_organization_company_and_users: {
        Args: {
          confirmation_text: string
          preserved_owner_user_id: string
          target_organization_id: string
        }
        Returns: Json
      }
      reset_organization_company_and_users_without_customer_import_su: {
        Args: {
          confirmation_text: string
          preserved_owner_user_id: string
          target_organization_id: string
        }
        Returns: Json
      }
      reset_organization_company_and_users_without_email_deliveries: {
        Args: {
          confirmation_text: string
          preserved_owner_user_id: string
          target_organization_id: string
        }
        Returns: Json
      }
      revert_public_landing_page: {
        Args: { target_version: number }
        Returns: {
          version: number
          version_id: string
        }[]
      }
      review_trial_request_qualification: {
        Args: {
          target_notes?: string
          target_trial_request_id: string
          target_workflow_fit: Database["public"]["Enums"]["trial_request_workflow_fit"]
        }
        Returns: {
          business_email: string
          business_name: string
          contact_name: string
          contacted_at: string | null
          converted_at: string | null
          converted_organization_deleted_id: string | null
          converted_organization_deleted_name: string | null
          converted_organization_deleted_slug: string | null
          converted_organization_id: string | null
          created_at: string
          declined_at: string | null
          estimated_users: number
          id: string
          other_use_case: string | null
          phone: string | null
          primary_use_case: Database["public"]["Enums"]["trial_request_use_case"]
          privacy_acknowledged_at: string
          qualification_notes: string | null
          qualification_reviewed_at: string | null
          qualification_reviewed_by: string | null
          qualified_at: string | null
          request_number: number
          status: Database["public"]["Enums"]["trial_request_status"]
          updated_at: string
          workflow_fit:
            | Database["public"]["Enums"]["trial_request_workflow_fit"]
            | null
          workflow_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trial_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_case_question_response: {
        Args: { target_case_question_id: string; target_response_value: Json }
        Returns: {
          case_id: string
          case_question_id: string
          created_at: string
          id: string
          organization_id: string
          responded_by_user_id: string
          response_value: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "case_question_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_case_type_title_mappings: {
        Args: { target_case_title_ids: string[]; target_case_type_id: string }
        Returns: undefined
      }
      save_organization_role_permissions: {
        Args: {
          target_changes?: Json
          target_organization_id: string
          target_restore?: boolean
          target_role: Database["public"]["Enums"]["application_role"]
        }
        Returns: undefined
      }
      save_question_definition:
        | {
            Args: {
              target_active: boolean
              target_completion_condition: string
              target_description: string
              target_display_order: number
              target_options?: Json
              target_organization_id: string
              target_question_group?: string
              target_question_id: string
              target_question_text: string
              target_require_all_options: boolean
              target_required: boolean
              target_response_type: Database["public"]["Enums"]["question_response_type"]
              target_track_required_options: boolean
            }
            Returns: {
              active: boolean
              completion_condition: string
              created_at: string
              created_by_user_id: string
              description: string
              display_order: number
              id: string
              organization_id: string
              question_group: string | null
              question_text: string
              require_all_options: boolean
              required: boolean
              response_type: Database["public"]["Enums"]["question_response_type"]
              track_required_options: boolean
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "question_definitions"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              target_active: boolean
              target_description: string
              target_display_order: number
              target_options?: Json
              target_organization_id: string
              target_question_group?: string
              target_question_id: string
              target_question_text: string
              target_require_all_options: boolean
              target_required: boolean
              target_response_type: Database["public"]["Enums"]["question_response_type"]
              target_track_required_options: boolean
            }
            Returns: {
              active: boolean
              completion_condition: string
              created_at: string
              created_by_user_id: string
              description: string
              display_order: number
              id: string
              organization_id: string
              question_group: string | null
              question_text: string
              require_all_options: boolean
              required: boolean
              response_type: Database["public"]["Enums"]["question_response_type"]
              track_required_options: boolean
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "question_definitions"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      save_rule_definition: {
        Args: {
          expected_updated_at?: string
          target_actions: Json
          target_active: boolean
          target_condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          target_condition_option_id: string
          target_description: string
          target_display_order: number
          target_name: string
          target_organization_id: string
          target_rule_id: string
          target_source_question_id: string
        }
        Returns: {
          active: boolean
          condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          condition_option_id: string | null
          created_at: string
          created_by_user_id: string
          description: string
          display_order: number
          id: string
          name: string
          organization_id: string
          source_question_id: string
          updated_at: string
          updated_by_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rule_definitions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_case_assignment: {
        Args: {
          target_active?: boolean
          target_assignment_role: Database["public"]["Enums"]["assignment_role"]
          target_case_id: string
          target_user_id: string
        }
        Returns: undefined
      }
      set_case_document_requirement_received: {
        Args: {
          target_option_id: string
          target_received: boolean
          target_task_id: string
        }
        Returns: {
          assigned_user_id: string | null
          blocking: boolean
          case_id: string
          completed_at: string | null
          completed_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          description: string
          due_at: string | null
          id: string
          intake_follow_up_id: string | null
          intake_question_definition_id: string | null
          intake_requirement_context: Json | null
          organization_id: string
          prior_actionable_status:
            | Database["public"]["Enums"]["case_task_status"]
            | null
          priority: Database["public"]["Enums"]["priority_level"]
          required: boolean
          sequence: number
          source_rule_action_id: string | null
          source_rule_id: string | null
          status: Database["public"]["Enums"]["case_task_status"]
          task_purpose_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "case_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_notification_read_state: {
        Args: { target_notification_id: string; target_read: boolean }
        Returns: {
          archived_at: string | null
          category: string
          created_at: string
          destination_path: string
          id: string
          message: string
          notification_type: string
          organization_id: string
          read_at: string | null
          recipient_user_id: string
          source_domain: string
          source_entity_id: string
          source_event_id: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_own_avatar_path: {
        Args: { target_avatar_path: string }
        Returns: {
          avatar_path: string | null
          avatar_updated_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          phone: string | null
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_service_request_assignment: {
        Args: {
          target_assigned_user_id?: string
          target_service_request_id: string
        }
        Returns: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          description: string
          id: string
          last_activity_at: string
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          request_number: string
          requester_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_service_request_case: {
        Args: {
          expected_case_id: string
          target_case_id: string
          target_service_request_id: string
        }
        Returns: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          description: string
          id: string
          last_activity_at: string
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          request_number: string
          requester_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_trial_request: {
        Args: {
          p_business_email: string
          p_business_name: string
          p_contact_name: string
          p_estimated_users: number
          p_other_use_case: string
          p_phone: string
          p_primary_use_case: Database["public"]["Enums"]["trial_request_use_case"]
          p_privacy_acknowledged: boolean
          p_workflow_notes: string
        }
        Returns: string
      }
      super_admin_customer_deletion_preview: {
        Args: { target_customer_id: string; target_organization_id: string }
        Returns: Json
      }
      super_admin_customer_merge_preview: {
        Args: {
          target_merged_customer_id: string
          target_organization_id: string
          target_surviving_customer_id: string
        }
        Returns: Json
      }
      super_admin_import_customers:
        | {
            Args: { target_organization_id: string; target_rows: Json }
            Returns: Json
          }
        | {
            Args: {
              target_organization_id: string
              target_rows: Json
              target_submission_id: string
            }
            Returns: Json
          }
      super_admin_merge_customers: {
        Args: {
          target_confirmation: string
          target_field_resolution: Json
          target_merged_customer_id: string
          target_organization_id: string
          target_surviving_customer_id: string
        }
        Returns: Json
      }
      super_admin_permanently_delete_customer: {
        Args: { target_customer_id: string; target_organization_id: string }
        Returns: Json
      }
      sync_guided_intake_requirement_task_status: {
        Args: { target_completed: boolean; target_task_id: string }
        Returns: {
          assigned_user_id: string | null
          blocking: boolean
          case_id: string
          completed_at: string | null
          completed_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          description: string
          due_at: string | null
          id: string
          intake_follow_up_id: string | null
          intake_question_definition_id: string | null
          intake_requirement_context: Json | null
          organization_id: string
          prior_actionable_status:
            | Database["public"]["Enums"]["case_task_status"]
            | null
          priority: Database["public"]["Enums"]["priority_level"]
          required: boolean
          sequence: number
          source_rule_action_id: string | null
          source_rule_id: string | null
          status: Database["public"]["Enums"]["case_task_status"]
          task_purpose_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "case_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      synchronize_case_rule_tasks: {
        Args: {
          target_actor_user_id: string
          target_case_id: string
          target_effective_action_ids: string[]
          target_organization_id: string
        }
        Returns: undefined
      }
      transition_case_status: {
        Args: {
          target_case_id: string
          target_status: Database["public"]["Enums"]["case_status"]
        }
        Returns: {
          case_number: string
          case_title_id: string | null
          case_type: string
          case_type_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          intake_submission_key: string | null
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
          tax_outcome: string | null
          tax_year: number | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_organization_membership: {
        Args: { target_action: string; target_membership_id: string }
        Returns: Database["public"]["Enums"]["organization_membership_status"]
      }
      transition_trial_request: {
        Args: {
          target_review_note?: string
          target_status: Database["public"]["Enums"]["trial_request_status"]
          target_trial_request_id: string
        }
        Returns: {
          business_email: string
          business_name: string
          contact_name: string
          contacted_at: string | null
          converted_at: string | null
          converted_organization_deleted_id: string | null
          converted_organization_deleted_name: string | null
          converted_organization_deleted_slug: string | null
          converted_organization_id: string | null
          created_at: string
          declined_at: string | null
          estimated_users: number
          id: string
          other_use_case: string | null
          phone: string | null
          primary_use_case: Database["public"]["Enums"]["trial_request_use_case"]
          privacy_acknowledged_at: string
          qualification_notes: string | null
          qualification_reviewed_at: string | null
          qualification_reviewed_by: string | null
          qualified_at: string | null
          request_number: number
          status: Database["public"]["Enums"]["trial_request_status"]
          updated_at: string
          workflow_fit:
            | Database["public"]["Enums"]["trial_request_workflow_fit"]
            | null
          workflow_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trial_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_case_task:
        | {
            Args: {
              target_assigned_user_id: string
              target_description: string
              target_due_date: string
              target_required: boolean
              target_status: Database["public"]["Enums"]["case_task_status"]
              target_task_id: string
              target_task_purpose_id: string
              target_title: string
            }
            Returns: {
              assigned_user_id: string | null
              blocking: boolean
              case_id: string
              completed_at: string | null
              completed_by_user_id: string | null
              created_at: string
              created_by_user_id: string
              description: string
              due_at: string | null
              id: string
              intake_follow_up_id: string | null
              intake_question_definition_id: string | null
              intake_requirement_context: Json | null
              organization_id: string
              prior_actionable_status:
                | Database["public"]["Enums"]["case_task_status"]
                | null
              priority: Database["public"]["Enums"]["priority_level"]
              required: boolean
              sequence: number
              source_rule_action_id: string | null
              source_rule_id: string | null
              status: Database["public"]["Enums"]["case_task_status"]
              task_purpose_id: string | null
              title: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "case_tasks"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              target_assigned_user_id: string
              target_description: string
              target_due_date: string
              target_required: boolean
              target_status: Database["public"]["Enums"]["case_task_status"]
              target_task_id: string
              target_title: string
            }
            Returns: {
              assigned_user_id: string | null
              blocking: boolean
              case_id: string
              completed_at: string | null
              completed_by_user_id: string | null
              created_at: string
              created_by_user_id: string
              description: string
              due_at: string | null
              id: string
              intake_follow_up_id: string | null
              intake_question_definition_id: string | null
              intake_requirement_context: Json | null
              organization_id: string
              prior_actionable_status:
                | Database["public"]["Enums"]["case_task_status"]
                | null
              priority: Database["public"]["Enums"]["priority_level"]
              required: boolean
              sequence: number
              source_rule_action_id: string | null
              source_rule_id: string | null
              status: Database["public"]["Enums"]["case_task_status"]
              task_purpose_id: string | null
              title: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "case_tasks"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      update_organization: {
        Args: {
          target_name: string
          target_organization_id: string
          target_slug: string
          target_status: Database["public"]["Enums"]["organization_status"]
        }
        Returns: {
          avatar_path: string | null
          avatar_updated_at: string | null
          business_postal_code: string | null
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_organization_membership: {
        Args: {
          target_active: boolean
          target_membership_id: string
          target_role: Database["public"]["Enums"]["application_role"]
        }
        Returns: {
          activated_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          is_active: boolean
          joined_at: string
          organization_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["application_role"]
          status: Database["public"]["Enums"]["organization_membership_status"]
          suspended_at: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "organization_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_platform_email_template: {
        Args: {
          target_closing_message: string
          target_opening_message: string
          target_subject_template: string
          target_template_key: string
        }
        Returns: boolean
      }
      update_service_request_priority: {
        Args: {
          target_priority: Database["public"]["Enums"]["priority_level"]
          target_service_request_id: string
        }
        Returns: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          description: string
          id: string
          last_activity_at: string
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          request_number: string
          requester_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_service_request_status: {
        Args: {
          target_service_request_id: string
          target_status: Database["public"]["Enums"]["service_request_status"]
        }
        Returns: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          description: string
          id: string
          last_activity_at: string
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          request_number: string
          requester_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_guided_intake_follow_up_task: {
        Args: {
          target_follow_up: Json
          target_organization_id: string
          target_submission_key: string
        }
        Returns: {
          assigned_user_id: string | null
          blocking: boolean
          case_id: string
          completed_at: string | null
          completed_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          description: string
          due_at: string | null
          id: string
          intake_follow_up_id: string | null
          intake_question_definition_id: string | null
          intake_requirement_context: Json | null
          organization_id: string
          prior_actionable_status:
            | Database["public"]["Enums"]["case_task_status"]
            | null
          priority: Database["public"]["Enums"]["priority_level"]
          required: boolean
          sequence: number
          source_rule_action_id: string | null
          source_rule_id: string | null
          status: Database["public"]["Enums"]["case_task_status"]
          task_purpose_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "case_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_my_membership_invitation: {
        Args: never
        Returns: {
          membership_id: string
          organization_id: string
          status: Database["public"]["Enums"]["organization_membership_status"]
        }[]
      }
      write_case_event: {
        Args: {
          target_actor_id: string
          target_case_id: string
          target_event_data?: Json
          target_event_type: string
          target_organization_id: string
        }
        Returns: string
      }
    }
    Enums: {
      application_role:
        | "SUPER_ADMIN"
        | "BUSINESS_ADMIN"
        | "BUSINESS_OWNER"
        | "STAFF_MANAGER"
        | "STAFF_USER"
      assignment_role: "MANAGER" | "STAFF"
      case_status:
        | "NEW"
        | "UNASSIGNED"
        | "ASSIGNED"
        | "IN_PROGRESS"
        | "WAITING"
        | "REVIEW"
        | "COMPLETED"
        | "CLOSED"
        | "CANCELLED"
      case_task_status:
        | "NOT_STARTED"
        | "IN_PROGRESS"
        | "BLOCKED"
        | "COMPLETED"
        | "NOT_APPLICABLE"
        | "WAITING_ON_CUSTOMER"
        | "REQUIRED_UNAVAILABLE"
      commercial_state: "TRIAL" | "PAID" | "UNPAID" | "COMP" | "INTERNAL"
      customer_status: "ACTIVE" | "INACTIVE" | "ARCHIVED"
      customer_type: "INDIVIDUAL" | "BUSINESS" | "ORGANIZATION"
      license_event_type:
        | "CREATED"
        | "TRIAL_STARTED"
        | "ACTIVATED"
        | "RENEWED"
        | "EXTENDED"
        | "COMMERCIAL_STATE_CHANGED"
        | "PLAN_CHANGED"
        | "SUSPENDED"
        | "REACTIVATED"
        | "CANCELLED"
        | "GRACE_CHANGED"
      license_status:
        | "TRIAL"
        | "ACTIVE"
        | "EXPIRING"
        | "EXPIRED"
        | "SUSPENDED"
        | "CANCELLED"
      organization_membership_status:
        | "INVITED"
        | "VERIFIED"
        | "ACTIVE"
        | "SUSPENDED"
        | "REVOKED"
      organization_status: "ACTIVE" | "SUSPENDED" | "ARCHIVED"
      priority_level: "LOW" | "NORMAL" | "HIGH" | "URGENT"
      question_response_type:
        | "TEXT"
        | "LONG_TEXT"
        | "YES_NO"
        | "SINGLE_SELECT"
        | "MULTI_SELECT"
        | "DATE"
        | "NUMBER"
      rule_action_type: "SHOW_QUESTION" | "REQUIRE_QUESTION" | "CREATE_TASK"
      rule_condition_operator:
        | "IS_YES"
        | "IS_NO"
        | "EQUALS"
        | "NOT_EQUALS"
        | "CONTAINS"
        | "NOT_CONTAINS"
        | "IS_ANSWERED"
        | "IS_NOT_ANSWERED"
      service_request_status:
        | "NEW"
        | "OPEN"
        | "PENDING_CUSTOMER"
        | "PENDING_STAFF"
        | "RESOLVED"
        | "CLOSED"
        | "ON_HOLD"
      trial_request_status:
        | "NEW"
        | "CONTACTED"
        | "QUALIFIED"
        | "DECLINED"
        | "CONVERTED"
      trial_request_use_case:
        | "SERVICE_DESK"
        | "CASE_MANAGEMENT"
        | "TASK_WORK_MANAGEMENT"
        | "COMMUNICATIONS"
        | "WORKFLOW_AUTOMATION"
        | "OPERATIONAL_REPORTING"
        | "OTHER_OPERATIONAL_WORKFLOW"
      trial_request_workflow_fit: "FIT" | "NEEDS_REVIEW" | "NOT_FIT"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      application_role: [
        "SUPER_ADMIN",
        "BUSINESS_ADMIN",
        "BUSINESS_OWNER",
        "STAFF_MANAGER",
        "STAFF_USER",
      ],
      assignment_role: ["MANAGER", "STAFF"],
      case_status: [
        "NEW",
        "UNASSIGNED",
        "ASSIGNED",
        "IN_PROGRESS",
        "WAITING",
        "REVIEW",
        "COMPLETED",
        "CLOSED",
        "CANCELLED",
      ],
      case_task_status: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "BLOCKED",
        "COMPLETED",
        "NOT_APPLICABLE",
        "WAITING_ON_CUSTOMER",
        "REQUIRED_UNAVAILABLE",
      ],
      commercial_state: ["TRIAL", "PAID", "UNPAID", "COMP", "INTERNAL"],
      customer_status: ["ACTIVE", "INACTIVE", "ARCHIVED"],
      customer_type: ["INDIVIDUAL", "BUSINESS", "ORGANIZATION"],
      license_event_type: [
        "CREATED",
        "TRIAL_STARTED",
        "ACTIVATED",
        "RENEWED",
        "EXTENDED",
        "COMMERCIAL_STATE_CHANGED",
        "PLAN_CHANGED",
        "SUSPENDED",
        "REACTIVATED",
        "CANCELLED",
        "GRACE_CHANGED",
      ],
      license_status: [
        "TRIAL",
        "ACTIVE",
        "EXPIRING",
        "EXPIRED",
        "SUSPENDED",
        "CANCELLED",
      ],
      organization_membership_status: [
        "INVITED",
        "VERIFIED",
        "ACTIVE",
        "SUSPENDED",
        "REVOKED",
      ],
      organization_status: ["ACTIVE", "SUSPENDED", "ARCHIVED"],
      priority_level: ["LOW", "NORMAL", "HIGH", "URGENT"],
      question_response_type: [
        "TEXT",
        "LONG_TEXT",
        "YES_NO",
        "SINGLE_SELECT",
        "MULTI_SELECT",
        "DATE",
        "NUMBER",
      ],
      rule_action_type: ["SHOW_QUESTION", "REQUIRE_QUESTION", "CREATE_TASK"],
      rule_condition_operator: [
        "IS_YES",
        "IS_NO",
        "EQUALS",
        "NOT_EQUALS",
        "CONTAINS",
        "NOT_CONTAINS",
        "IS_ANSWERED",
        "IS_NOT_ANSWERED",
      ],
      service_request_status: [
        "NEW",
        "OPEN",
        "PENDING_CUSTOMER",
        "PENDING_STAFF",
        "RESOLVED",
        "CLOSED",
        "ON_HOLD",
      ],
      trial_request_status: [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "DECLINED",
        "CONVERTED",
      ],
      trial_request_use_case: [
        "SERVICE_DESK",
        "CASE_MANAGEMENT",
        "TASK_WORK_MANAGEMENT",
        "COMMUNICATIONS",
        "WORKFLOW_AUTOMATION",
        "OPERATIONAL_REPORTING",
        "OTHER_OPERATIONAL_WORKFLOW",
      ],
      trial_request_workflow_fit: ["FIT", "NEEDS_REVIEW", "NOT_FIT"],
    },
  },
} as const
