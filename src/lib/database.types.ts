
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "blocks": {
                  Row: {
                    "collapsed": boolean,"config": NonNullable<Json>,"created_at": string,"deleted_at": string | null,"id": string,"owner_id": string,"page_id": string,"position": number,"space_id": string,"span": number,"title": string,"type": Database["public"]['Enums']["block_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "collapsed"?: boolean,"config"?: NonNullable<Json>,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"owner_id"?: string,"page_id": string,"position": number,"space_id": string,"span"?: number,"title": string,"type": Database["public"]['Enums']["block_type"],"updated_at"?: string
                  }
                  Update: {
                    "collapsed"?: boolean,"config"?: NonNullable<Json>,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"owner_id"?: string,"page_id"?: string,"position"?: number,"space_id"?: string,"span"?: number,"title"?: string,"type"?: Database["public"]['Enums']["block_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_page_id_fkey"
      columns: ["page_id"]
isOneToOne: false
      referencedRelation: "pages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"calendar_sync_log": {
                  Row: {
                    "action": string,"at": string,"http_status": number | null,"id": number,"kind": string,"outcome": string,"owner_id": string,"reason": string | null,"target_id": string | null,"target_title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"at"?: string,"http_status"?: number | null,"id"?: never,"kind": string,"outcome": string,"owner_id": string,"reason"?: string | null,"target_id"?: string | null,"target_title"?: string | null
                  }
                  Update: {
                    "action"?: string,"at"?: string,"http_status"?: number | null,"id"?: never,"kind"?: string,"outcome"?: string,"owner_id"?: string,"reason"?: string | null,"target_id"?: string | null,"target_title"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"deadline_changes": {
                  Row: {
                    "changed_at": string,"created_at": string,"id": string,"item_title": string,"kind": Database["public"]['Enums']["deadline_change_kind"],"new_due": string | null,"old_due": string | null,"owner_id": string,"reason": string,"space_id": string,"task_id": string | null,"was_late": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"created_at"?: string,"id"?: string,"item_title": string,"kind"?: Database["public"]['Enums']["deadline_change_kind"],"new_due"?: string | null,"old_due"?: string | null,"owner_id"?: string,"reason": string,"space_id": string,"task_id"?: string | null,"was_late": boolean
                  }
                  Update: {
                    "changed_at"?: string,"created_at"?: string,"id"?: string,"item_title"?: string,"kind"?: Database["public"]['Enums']["deadline_change_kind"],"new_due"?: string | null,"old_due"?: string | null,"owner_id"?: string,"reason"?: string,"space_id"?: string,"task_id"?: string | null,"was_late"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "deadline_changes_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"google_connections": {
                  Row: {
                    "auto_sync_new_blocks": boolean,"calendar_id": string,"created_at": string,"google_email": string,"last_error": string | null,"last_success_at": string | null,"owner_id": string,"push_deadlines": boolean,"refresh_token_secret_id": string | null,"scopes": (string)[],"status": Database["public"]['Enums']["connection_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_sync_new_blocks"?: boolean,"calendar_id"?: string,"created_at"?: string,"google_email": string,"last_error"?: string | null,"last_success_at"?: string | null,"owner_id": string,"push_deadlines"?: boolean,"refresh_token_secret_id"?: string | null,"scopes": (string)[],"status"?: Database["public"]['Enums']["connection_status"],"updated_at"?: string
                  }
                  Update: {
                    "auto_sync_new_blocks"?: boolean,"calendar_id"?: string,"created_at"?: string,"google_email"?: string,"last_error"?: string | null,"last_success_at"?: string | null,"owner_id"?: string,"push_deadlines"?: boolean,"refresh_token_secret_id"?: string | null,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["connection_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notes": {
                  Row: {
                    "block_id": string,"body": NonNullable<Json>,"body_text": string,"created_at": string,"owner_id": string,"search": unknown,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"body"?: NonNullable<Json>,"body_text"?: string,"created_at"?: string,"owner_id"?: string,"search"?: never,"updated_at"?: string
                  }
                  Update: {
                    "block_id"?: string,"body"?: NonNullable<Json>,"body_text"?: string,"created_at"?: string,"owner_id"?: string,"search"?: never,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_block_id_fkey"
      columns: ["block_id"]
isOneToOne: true
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    }
                  ]
                },"pages": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"owner_id": string,"position": number,"space_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"owner_id"?: string,"position": number,"space_id": string,"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"owner_id"?: string,"position"?: number,"space_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pages_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"currency": string,"display_name": string | null,"id": string,"last_page_by_space": NonNullable<Json>,"theme": Database["public"]['Enums']["theme_pref"],"timezone": string,"updated_at": string,"week_starts_on": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"display_name"?: string | null,"id": string,"last_page_by_space"?: NonNullable<Json>,"theme"?: Database["public"]['Enums']["theme_pref"],"timezone"?: string,"updated_at"?: string,"week_starts_on"?: number
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"display_name"?: string | null,"id"?: string,"last_page_by_space"?: NonNullable<Json>,"theme"?: Database["public"]['Enums']["theme_pref"],"timezone"?: string,"updated_at"?: string,"week_starts_on"?: number
                  }
                  Relationships: [
                    
                  ]
                },"reviews": {
                  Row: {
                    "created_at": string,"id": string,"next_priority": string | null,"owner_id": string,"saved_at": string,"slipped": string | null,"stats": NonNullable<Json>,"updated_at": string,"week_start": string,"went_well": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"next_priority"?: string | null,"owner_id"?: string,"saved_at"?: string,"slipped"?: string | null,"stats": NonNullable<Json>,"updated_at"?: string,"week_start": string,"went_well"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"next_priority"?: string | null,"owner_id"?: string,"saved_at"?: string,"slipped"?: string | null,"stats"?: NonNullable<Json>,"updated_at"?: string,"week_start"?: string,"went_well"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"routine_checks": {
                  Row: {
                    "block_id": string,"check_date": string,"checked_at": string,"created_at": string,"id": string,"owner_id": string,"step_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"check_date": string,"checked_at"?: string,"created_at"?: string,"id"?: string,"owner_id"?: string,"step_id": string
                  }
                  Update: {
                    "block_id"?: string,"check_date"?: string,"checked_at"?: string,"created_at"?: string,"id"?: string,"owner_id"?: string,"step_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_checks_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_checks_step_id_fkey"
      columns: ["step_id"]
isOneToOne: false
      referencedRelation: "routine_steps"
      referencedColumns: ["id"]
    }
                  ]
                },"routine_steps": {
                  Row: {
                    "archived_at": string | null,"block_id": string,"created_at": string,"id": string,"label": string,"owner_id": string,"position": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"block_id": string,"created_at"?: string,"id"?: string,"label": string,"owner_id"?: string,"position": number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"block_id"?: string,"created_at"?: string,"id"?: string,"label"?: string,"owner_id"?: string,"position"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_steps_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    }
                  ]
                },"spaces": {
                  Row: {
                    "cover_path": string | null,"created_at": string,"deadline": string | null,"deleted_at": string | null,"description": string | null,"end_goal": string | null,"id": string,"kind": Database["public"]['Enums']["space_kind"],"mark": Database["public"]['Enums']["mark_color"],"metric": Database["public"]['Enums']["goal_metric"],"metric_config": NonNullable<Json>,"name": string,"owner_id": string,"position": number,"start_date": string | null,"status": Database["public"]['Enums']["space_status"],"status_changed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_path"?: string | null,"created_at"?: string,"deadline"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"end_goal"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["space_kind"],"mark"?: Database["public"]['Enums']["mark_color"],"metric"?: Database["public"]['Enums']["goal_metric"],"metric_config"?: NonNullable<Json>,"name": string,"owner_id"?: string,"position": number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["space_status"],"status_changed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cover_path"?: string | null,"created_at"?: string,"deadline"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"end_goal"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["space_kind"],"mark"?: Database["public"]['Enums']["mark_color"],"metric"?: Database["public"]['Enums']["goal_metric"],"metric_config"?: NonNullable<Json>,"name"?: string,"owner_id"?: string,"position"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["space_status"],"status_changed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"table_columns": {
                  Row: {
                    "block_id": string,"created_at": string,"id": string,"kind": Database["public"]['Enums']["column_kind"],"name": string,"options": NonNullable<Json>,"owner_id": string,"position": number,"signed": boolean,"summary": Database["public"]['Enums']["summary_kind"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["column_kind"],"name": string,"options"?: NonNullable<Json>,"owner_id"?: string,"position": number,"signed"?: boolean,"summary"?: Database["public"]['Enums']["summary_kind"],"updated_at"?: string
                  }
                  Update: {
                    "block_id"?: string,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["column_kind"],"name"?: string,"options"?: NonNullable<Json>,"owner_id"?: string,"position"?: number,"signed"?: boolean,"summary"?: Database["public"]['Enums']["summary_kind"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_columns_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    }
                  ]
                },"table_rows": {
                  Row: {
                    "block_id": string,"cells": NonNullable<Json>,"created_at": string,"deleted_at": string | null,"id": string,"owner_id": string,"position": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"cells"?: NonNullable<Json>,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"owner_id"?: string,"position": number,"updated_at"?: string
                  }
                  Update: {
                    "block_id"?: string,"cells"?: NonNullable<Json>,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"owner_id"?: string,"position"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_rows_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "block_id": string,"completed_at": string | null,"created_at": string,"deleted_at": string | null,"depth": number,"done": boolean,"due_date": string | null,"due_time": string | null,"gcal_event_id": string | null,"id": string,"is_milestone": boolean,"last_synced_at": string | null,"next_sync_at": string | null,"note": string | null,"owner_id": string,"parent_id": string | null,"position": number,"repeat_rule": Json | null,"reschedule_count": number,"space_id": string,"sync_attempts": number,"sync_error": string | null,"sync_status": Database["public"]['Enums']["sync_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"completed_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"depth"?: number,"done"?: boolean,"due_date"?: string | null,"due_time"?: string | null,"gcal_event_id"?: string | null,"id"?: string,"is_milestone"?: boolean,"last_synced_at"?: string | null,"next_sync_at"?: string | null,"note"?: string | null,"owner_id"?: string,"parent_id"?: string | null,"position": number,"repeat_rule"?: Json | null,"reschedule_count"?: number,"space_id": string,"sync_attempts"?: number,"sync_error"?: string | null,"sync_status"?: Database["public"]['Enums']["sync_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "block_id"?: string,"completed_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"depth"?: number,"done"?: boolean,"due_date"?: string | null,"due_time"?: string | null,"gcal_event_id"?: string | null,"id"?: string,"is_milestone"?: boolean,"last_synced_at"?: string | null,"next_sync_at"?: string | null,"note"?: string | null,"owner_id"?: string,"parent_id"?: string | null,"position"?: number,"repeat_rule"?: Json | null,"reschedule_count"?: number,"space_id"?: string,"sync_attempts"?: number,"sync_error"?: string | null,"sync_status"?: Database["public"]['Enums']["sync_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"time_blocks": {
                  Row: {
                    "block_id": string,"created_at": string,"deleted_at": string | null,"ends_at": string,"gcal_event_id": string | null,"id": string,"last_synced_at": string | null,"next_sync_at": string | null,"owner_id": string,"space_id": string,"starts_at": string,"sync_attempts": number,"sync_error": string | null,"sync_status": Database["public"]['Enums']["sync_status"],"task_id": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"created_at"?: string,"deleted_at"?: string | null,"ends_at": string,"gcal_event_id"?: string | null,"id"?: string,"last_synced_at"?: string | null,"next_sync_at"?: string | null,"owner_id"?: string,"space_id": string,"starts_at": string,"sync_attempts"?: number,"sync_error"?: string | null,"sync_status"?: Database["public"]['Enums']["sync_status"],"task_id"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "block_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"ends_at"?: string,"gcal_event_id"?: string | null,"id"?: string,"last_synced_at"?: string | null,"next_sync_at"?: string | null,"owner_id"?: string,"space_id"?: string,"starts_at"?: string,"sync_attempts"?: number,"sync_error"?: string | null,"sync_status"?: Database["public"]['Enums']["sync_status"],"task_id"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_blocks_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_blocks_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_blocks_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"tracker_entries": {
                  Row: {
                    "block_id": string,"created_at": string,"entry_date": string,"field_id": string,"id": string,"note": string | null,"owner_id": string,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"created_at"?: string,"entry_date": string,"field_id": string,"id"?: string,"note"?: string | null,"owner_id"?: string,"updated_at"?: string,"value": number
                  }
                  Update: {
                    "block_id"?: string,"created_at"?: string,"entry_date"?: string,"field_id"?: string,"id"?: string,"note"?: string | null,"owner_id"?: string,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracker_entries_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tracker_entries_field_id_fkey"
      columns: ["field_id"]
isOneToOne: false
      referencedRelation: "tracker_fields"
      referencedColumns: ["id"]
    }
                  ]
                },"tracker_fields": {
                  Row: {
                    "archived_at": string | null,"block_id": string,"created_at": string,"decimals": number,"id": string,"label": string,"owner_id": string,"position": number,"target_kind": Database["public"]['Enums']["target_kind"] | null,"target_value": number | null,"unit": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"block_id": string,"created_at"?: string,"decimals"?: number,"id"?: string,"label": string,"owner_id"?: string,"position": number,"target_kind"?: Database["public"]['Enums']["target_kind"] | null,"target_value"?: number | null,"unit"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"block_id"?: string,"created_at"?: string,"decimals"?: number,"id"?: string,"label"?: string,"owner_id"?: string,"position"?: number,"target_kind"?: Database["public"]['Enums']["target_kind"] | null,"target_value"?: number | null,"unit"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracker_fields_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_sync_rows":
{ Args: { "p_id": string,"p_kind": string,"p_limit": number,"p_owner": string }; Returns: Json
                           },
"connect_google_account":
{ Args: { "p_email": string,"p_owner": string,"p_scopes": (string)[],"p_token": string }; Returns: undefined
                           },
"delete_task":
{ Args: { "p_reason"?: string,"p_task_id": string }; Returns: undefined
                           },
"disconnect_google_account":
{ Args: { "p_owner": string }; Returns: undefined
                           },
"duplicate_block":
{ Args: { "p_block_id": string,"p_include_content": boolean }; Returns: string
                           },
"duplicate_page":
{ Args: { "p_include_content": boolean,"p_page_id": string }; Returns: string
                           },
"finish_sync_row":
{ Args: { "p_attempts": number,"p_clear_event": boolean,"p_error": string,"p_event_id": string,"p_id": string,"p_kind": string,"p_lease": string,"p_next": string,"p_status": Database["public"]['Enums']["sync_status"] }; Returns: boolean
                           },
"get_calendar_log":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"get_calendar_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_today":
{ Args: { "p_today"?: string }; Returns: Json
                           },
"is_valid_timezone":
{ Args: { "p_tz": string }; Returns: boolean
                           },
"move_block":
{ Args: { "p_block_id": string,"p_target_page": string }; Returns: Json
                           },
"move_page":
{ Args: { "p_page_id": string,"p_target_space": string }; Returns: Json
                           },
"purge_trash":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"read_google_refresh_token":
{ Args: { "p_owner": string }; Returns: string
                           },
"remember_page":
{ Args: { "p_page_id": string,"p_space_id": string }; Returns: undefined
                           },
"reorder":
{ Args: { "p_after": string,"p_before": string,"p_id": string,"p_table": string }; Returns: number
                           },
"request_calendar_sync":
{ Args: { "p_time_block_id": string }; Returns: undefined
                           },
"reschedule_space":
{ Args: { "p_cascade_tasks"?: boolean,"p_new_deadline": string,"p_reason": string,"p_space_id": string }; Returns: Json
                           },
"reschedule_task":
{ Args: { "p_cascade_children"?: boolean,"p_new_due": string,"p_reason": string,"p_task_id": string }; Returns: Json
                           },
"restore_item":
{ Args: { "p_id": string,"p_table": string }; Returns: Json
                           },
"retry_calendar_sync":
{ Args: { "p_id"?: string }; Returns: number
                           },
"routine_streak":
{ Args: { "p_block_id": string,"p_today"?: string }; Returns: Json
                           },
"search_all":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: Json
                           },
"seed_owner":
{ Args: { "p_examples"?: boolean,"p_owner": string,"p_today"?: string }; Returns: Json
                           },
"set_calendar_prefs":
{ Args: { "p_auto_sync": boolean,"p_calendar_id": string,"p_push_deadlines": boolean }; Returns: undefined
                           },
"set_task_done":
{ Args: { "p_done": boolean,"p_task_id": string }; Returns: undefined
                           },
"space_summary":
{ Args: { "p_space_id": string,"p_today"?: string }; Returns: Json
                           },
"tracker_series":
{ Args: { "p_days": number,"p_field_id": string }; Returns: Json
                           },
"trash_item":
{ Args: { "p_id": string,"p_reason"?: string,"p_table": string }; Returns: Json
                           },
"week_review":
{ Args: { "p_week_start": string }; Returns: Json
                           }
          }
          Enums: {
            "block_type": "todo"|"roadmap"|"tracker"|"table"|"timeblock"|"routine"|"notes","column_kind": "text"|"number"|"money"|"date"|"select"|"checkbox"|"url","connection_status": "connected"|"needs_reconnect"|"disconnected","deadline_change_kind": "reschedule"|"deleted_while_late","goal_metric": "tasks"|"tracker"|"table_count"|"manual","mark_color": "moss"|"slate"|"ochre"|"teal"|"clay"|"graphite","space_kind": "goal"|"area","space_status": "active"|"achieved"|"missed"|"archived","summary_kind": "none"|"sum"|"avg"|"count","sync_status": "not_synced"|"pending"|"synced"|"failed"|"delete_pending","target_kind": "at_most"|"at_least"|"reach","theme_pref": "system"|"light"|"dark"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "block_type": ["todo", "roadmap", "tracker", "table", "timeblock", "routine", "notes"],"column_kind": ["text", "number", "money", "date", "select", "checkbox", "url"],"connection_status": ["connected", "needs_reconnect", "disconnected"],"deadline_change_kind": ["reschedule", "deleted_while_late"],"goal_metric": ["tasks", "tracker", "table_count", "manual"],"mark_color": ["moss", "slate", "ochre", "teal", "clay", "graphite"],"space_kind": ["goal", "area"],"space_status": ["active", "achieved", "missed", "archived"],"summary_kind": ["none", "sum", "avg", "count"],"sync_status": ["not_synced", "pending", "synced", "failed", "delete_pending"],"target_kind": ["at_most", "at_least", "reach"],"theme_pref": ["system", "light", "dark"]
          }
        }
} as const
