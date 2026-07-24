export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      books: {
        Row: {
          user_id: string;
          id: string;
          title: string;
          author: string;
          content_type: string;
          youtube_url: string | null;
          youtube_video_id: string | null;
          thumbnail_url: string | null;
          status: string;
          cover_storage_path: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          server_updated_at: string;
        };
        Insert: {
          user_id: string;
          id: string;
          title: string;
          author: string;
          content_type?: string;
          youtube_url?: string | null;
          youtube_video_id?: string | null;
          thumbnail_url?: string | null;
          status: string;
          cover_storage_path?: string | null;
          created_at: string;
          updated_at: string;
          deleted_at?: string | null;
          server_updated_at?: string;
        };
        Update: {
          title?: string;
          author?: string;
          content_type?: string;
          youtube_url?: string | null;
          youtube_video_id?: string | null;
          thumbnail_url?: string | null;
          status?: string;
          cover_storage_path?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      book_notes: {
        Row: {
          user_id: string;
          id: string;
          book_id: string;
          title: string;
          formatted_content: Json | null;
          extracted_text: string;
          personal_reflection: string;
          page_number: string | null;
          tags: string[];
          source_type: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          server_updated_at: string;
        };
        Insert: {
          user_id: string;
          id: string;
          book_id: string;
          title?: string;
          formatted_content?: Json | null;
          extracted_text?: string;
          personal_reflection?: string;
          page_number?: string | null;
          tags?: string[];
          source_type: string;
          created_at: string;
          updated_at: string;
          deleted_at?: string | null;
          server_updated_at?: string;
        };
        Update: {
          book_id?: string;
          title?: string;
          formatted_content?: Json | null;
          extracted_text?: string;
          personal_reflection?: string;
          page_number?: string | null;
          tags?: string[];
          source_type?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      note_reading_metadata: {
        Row: {
          user_id: string;
          note_id: string;
          is_favorite: boolean;
          is_important: boolean;
          last_read_at: string | null;
          read_count: number;
          last_suggested_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          server_updated_at: string;
        };
        Insert: {
          user_id: string;
          note_id: string;
          is_favorite?: boolean;
          is_important?: boolean;
          last_read_at?: string | null;
          read_count?: number;
          last_suggested_at?: string | null;
          created_at: string;
          updated_at: string;
          deleted_at?: string | null;
          server_updated_at?: string;
        };
        Update: {
          is_favorite?: boolean;
          is_important?: boolean;
          last_read_at?: string | null;
          read_count?: number;
          last_suggested_at?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
