export interface BillingProfile {
  company_name:  string;
  address:       string;
  email:         string;
  phone:         string;
  payment_terms: string;
  updated_at:    string;
}

export type RateMode = 'hourly' | 'per_ticket';

export interface OrgBillingRate {
  id:          string;
  org_id:      string;
  org_name:    string;
  mode:        RateMode;
  currency:    string;
  hourly_rate: string | null;
  l1_rate:     string | null;
  l2_rate:     string | null;
  l3_rate:     string | null;
  updated_at:  string;
}

export interface OrgRateEntry {
  org_id:   string;
  org_name: string;
  rate:     OrgBillingRate | null;
}

export interface InvoiceLineItem {
  id:             string;
  description:    string;
  unit_rate:      string;
  amount:         string;
  ticket_ref:     string;
  ticket_subject: string;
  ticket_level:   string;
  log_date:       string | null;
  agent_name:     string;
  minutes:        number | null;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface Invoice {
  id:             string;
  source?:        'ticket' | 'project_time';
  invoice_number: string;
  org_id:         string;
  org_name:       string;
  period_from:    string;
  period_to:      string;
  status:         InvoiceStatus;
  currency:       string;
  subtotal:       string;
  tax_rate:       string;
  tax_amount:     string;
  total:          string;
  line_items:     InvoiceLineItem[];
  created_at:     string;
}
