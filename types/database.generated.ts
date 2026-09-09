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
            foreignKeyName: "case_assignments_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
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
        ]
      }
      cases: {
        Row: {
          case_number: string
          case_type: string
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at: string
        }
        Insert: {
          case_number: string
          case_type: string
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id: string
          customer_id: string
          description?: string
          due_at?: string | null
          id?: string
          manager_user_id?: string | null
          opened_at?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["priority_level"]
          status?: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at?: string
        }
        Update: {
          case_number?: string
          case_type?: string
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          customer_id?: string
          description?: string
          due_at?: string | null
          id?: string
          manager_user_id?: string | null
          opened_at?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          status?: Database["public"]["Enums"]["case_status"]
          title?: string
          updated_at?: string
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
          created_at: string
          created_by_user_id: string | null
          customer_number: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          status: Database["public"]["Enums"]["customer_status"]
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          customer_number: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          type: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          customer_number?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
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
      organization_case_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
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
          created_at: string
          id: string
          is_active: boolean
          joined_at: string
          organization_id: string
          role: Database["public"]["Enums"]["application_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          organization_id: string
          role: Database["public"]["Enums"]["application_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["application_role"]
          updated_at?: string
          user_id?: string
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
          organization_id: string
          portal_enabled: boolean
          portal_show_priority: boolean
          portal_submission_enabled: boolean
          portal_support_label: string | null
          portal_welcome_message: string | null
          timezone: string
          timezone_resolved_from_postal_code: string | null
          timezone_source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_priority?: Database["public"]["Enums"]["priority_level"]
          organization_id: string
          portal_enabled?: boolean
          portal_show_priority?: boolean
          portal_submission_enabled?: boolean
          portal_support_label?: string | null
          portal_welcome_message?: string | null
          timezone?: string
          timezone_resolved_from_postal_code?: string | null
          timezone_source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_priority?: Database["public"]["Enums"]["priority_level"]
          organization_id?: string
          portal_enabled?: boolean
          portal_show_priority?: boolean
          portal_submission_enabled?: boolean
          portal_support_label?: string | null
          portal_welcome_message?: string | null
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
          updated_at?: string
        }
        Relationships: []
      }
      question_definitions: {
        Row: {
          active: boolean
          created_at: string
          created_by_user_id: string
          description: string
          display_order: number
          id: string
          organization_id: string
          question_text: string
          required: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by_user_id: string
          description?: string
          display_order?: number
          id?: string
          organization_id: string
          question_text: string
          required?: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by_user_id?: string
          description?: string
          display_order?: number
          id?: string
          organization_id?: string
          question_text?: string
          required?: boolean
          response_type?: Database["public"]["Enums"]["question_response_type"]
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
          option_label: string
          option_value: string
          organization_id: string
          question_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          option_label: string
          option_value: string
          organization_id: string
          question_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
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
          task_priority?: Database["public"]["Enums"]["priority_level"] | null
          task_required?: boolean | null
          task_title?: string | null
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
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
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
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
            foreignKeyName: "rule_definitions_source_question_fkey"
            columns: ["organization_id", "source_question_id"]
            isOneToOne: false
            referencedRelation: "question_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rule_definitions_condition_option_fkey"
            columns: ["organization_id", "source_question_id", "condition_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["organization_id", "question_id", "id"]
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
            referencedRelation: "service_request_messages"
            referencedColumns: ["id"]
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
            foreignKeyName: "service_requests_organization_id_customer_id_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
    Views: {
      organization_case_activity: {
        Row: {
          actor_display_name: string | null
          actor_user_id: string | null
          case_id: string
          created_at: string
          event_data: Json
          event_type: string
          id: string
          organization_id: string
        }
        Relationships: []
      }
      organization_case_tasks: {
        Row: {
          assigned_user_id: string | null
          blocking: boolean
          case_id: string
          completed_at: string | null
          completed_by_display_name: string | null
          completed_by_user_id: string | null
          created_at: string
          created_by_display_name: string | null
          created_by_user_id: string | null
          description: string
          due_at: string | null
          generated_by_rule: boolean
          id: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          required: boolean
          sequence: number
          status: Database["public"]["Enums"]["case_task_status"]
          title: string
          updated_at: string
        }
        Relationships: []
      }
      organization_cases: {
        Row: {
          case_number: string
          case_type: string
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_display_name: string | null
          created_by_user_id: string | null
          customer_id: string
          description: string
          due_at: string | null
          id: string
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at: string
        }
        Relationships: []
      }
      organization_customers: {
        Row: {
          created_at: string
          created_by_display_name: string | null
          created_by_user_id: string | null
          customer_number: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          status: Database["public"]["Enums"]["customer_status"]
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
        }
        Relationships: []
      }
      organization_question_definitions: {
        Row: {
          active: boolean
          created_at: string
          created_by_display_name: string | null
          created_by_user_id: string | null
          description: string
          display_order: number
          id: string
          organization_id: string
          question_text: string
          required: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
          updated_at: string
        }
        Relationships: []
      }
      organization_rule_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["rule_action_type"]
          created_at: string
          created_by_display_name: string | null
          created_by_user_id: string | null
          display_order: number
          id: string
          organization_id: string
          rule_definition_id: string
          target_question_id: string | null
          task_blocking: boolean | null
          task_description: string | null
          task_priority: Database["public"]["Enums"]["priority_level"] | null
          task_required: boolean | null
          task_title: string | null
          updated_at: string
          updated_by_display_name: string | null
          updated_by_user_id: string | null
        }
        Relationships: []
      }
      organization_rule_definitions: {
        Row: {
          active: boolean
          condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          condition_option_id: string | null
          created_at: string
          created_by_display_name: string | null
          created_by_user_id: string | null
          description: string
          display_order: number
          id: string
          name: string
          organization_id: string
          source_question_id: string
          updated_at: string
          updated_by_display_name: string | null
          updated_by_user_id: string | null
        }
        Relationships: []
      }
      organization_service_request_activity: {
        Row: {
          actor_display_name: string | null
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
        Relationships: []
      }
      organization_service_request_communications: {
        Row: {
          actor_display_name: string | null
          actor_user_id: string | null
          channel: string
          communication_type: string
          created_at: string
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_summary: string | null
          id: string
          organization_id: string
          recipient_email: string | null
          recipient_user_id: string | null
          related_message_id: string | null
          service_request_id: string
          status: string
          subject: string | null
        }
        Relationships: []
      }
      organization_service_request_messages: {
        Row: {
          author_display_name: string | null
          author_type: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          organization_id: string
          service_request_id: string
        }
        Relationships: []
      }
      organization_service_requests: {
        Row: {
          assigned_user_id: string | null
          case_id: string | null
          closed_at: string | null
          created_at: string
          created_by_display_name: string | null
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
        Relationships: []
      }
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
      default_organization_role_permission: {
        Args: {
          target_permission: string
          target_role: Database["public"]["Enums"]["application_role"]
        }
        Returns: boolean
      }
      effective_organization_role_permission: {
        Args: {
          target_organization_id: string
          target_permission: string
          target_role: Database["public"]["Enums"]["application_role"]
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
      create_case_task: {
        Args: {
          target_assigned_user_id?: string
          target_case_id: string
          target_description?: string
          target_due_at?: string
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
          target_title: string
        }
        Returns: {
          case_number: string
          case_type: string
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
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
      reassign_case_customer: {
        Args: { target_case_id: string; target_customer_id: string }
        Returns: undefined
      }
      create_customer_record: {
        Args: {
          target_email?: string
          target_name: string
          target_notes?: string
          target_organization_id: string
          target_phone?: string
          target_type: Database["public"]["Enums"]["customer_type"]
        }
        Returns: {
          created_at: string
          created_by_user_id: string | null
          customer_number: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          status: Database["public"]["Enums"]["customer_status"]
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
      delete_case_task: { Args: { target_task_id: string }; Returns: undefined }
      get_case_progress: {
        Args: { target_case_id: string }
        Returns: {
          completed_required_tasks: number
          percentage: number
          remaining_required_tasks: number
          total_required_tasks: number
        }[]
      }
      get_platform_operational_actor_audit: {
        Args: { target_organization_id: string }
        Returns: {
          actor_column: string
          actor_user_id: string | null
          record_id: string
          source_table: string
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
      has_organization_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["application_role"][]
          check_organization_id: string
          check_user_id?: string
        }
        Returns: boolean
      }
      has_effective_organization_permission: {
        Args: {
          target_organization_id: string
          target_permission: string
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
      is_super_admin: { Args: { check_user_id?: string }; Returns: boolean }
      is_valid_organization_actor: {
        Args: { target_organization_id: string; target_user_id: string }
        Returns: boolean
      }
      mark_all_notifications_read: {
        Args: { target_organization_id: string }
        Returns: number
      }
      move_case_task: {
        Args: { target_direction: string; target_task_id: string }
        Returns: undefined
      }
      organization_actor_id: {
        Args: { target_actor: string }
        Returns: string | null
      }
      organization_actor_label: {
        Args: { target_actor: string }
        Returns: string | null
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
      provision_organization_member: {
        Args: {
          target_email: string
          target_organization_id: string
          target_role: Database["public"]["Enums"]["application_role"]
        }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          joined_at: string
          organization_id: string
          role: Database["public"]["Enums"]["application_role"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_members"
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
      synchronize_case_rule_tasks: {
        Args: {
          target_actor_user_id: string
          target_case_id: string
          target_effective_action_ids: string[]
          target_organization_id: string
        }
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
      save_rule_definition: {
        Args: {
          expected_updated_at?: string | null
          target_actions: Json
          target_active: boolean
          target_condition_operator: Database["public"]["Enums"]["rule_condition_operator"]
          target_condition_option_id: string | null
          target_description: string
          target_display_order: number
          target_name: string
          target_organization_id: string
          target_rule_id: string | null
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
      save_question_definition: {
        Args: {
          target_active: boolean
          target_description: string
          target_display_order: number
          target_options?: Json
          target_organization_id: string
          target_question_id: string
          target_question_text: string
          target_required: boolean
          target_response_type: Database["public"]["Enums"]["question_response_type"]
        }
        Returns: {
          active: boolean
          created_at: string
          created_by_user_id: string
          description: string
          display_order: number
          id: string
          organization_id: string
          question_text: string
          required: boolean
          response_type: Database["public"]["Enums"]["question_response_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "question_definitions"
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
          expected_case_id: string | null
          target_case_id: string | null
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
      transition_case_status: {
        Args: {
          target_case_id: string
          target_status: Database["public"]["Enums"]["case_status"]
        }
        Returns: {
          case_number: string
          case_type: string
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          description: string
          due_at: string | null
          id: string
          manager_user_id: string | null
          opened_at: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["case_status"]
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
      update_case_task: {
        Args: {
          target_assigned_user_id: string
          target_description: string
          target_due_at: string
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
          created_at: string
          id: string
          is_active: boolean
          joined_at: string
          organization_id: string
          role: Database["public"]["Enums"]["application_role"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_members"
          isOneToOne: true
          isSetofReturn: false
        }
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
        | "PUBLIC_USER"
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
        "PUBLIC_USER",
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
      service_request_status: [
        "NEW",
        "OPEN",
        "PENDING_CUSTOMER",
        "PENDING_STAFF",
        "RESOLVED",
        "CLOSED",
        "ON_HOLD",
      ],
    },
  },
} as const
