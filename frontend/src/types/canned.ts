export interface CannedCategory {
  id:         string;
  name:       string;
  created_at: string;
}

export interface CannedResponse {
  id:            string;
  category:      string; // UUID
  category_name: string;
  title:         string;
  body:          string;
  created_at:    string;
  updated_at:    string;
}
