export interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
}

export interface Account {
  id: number;
  name: string;
  bank: string;
  account_type: string;
  iban?: string;
}

export interface Statement {
  id: number;
  account_id: number;
  account_name: string;
  period_start: string;
  period_end: string;
  filename: string;
  transaction_count: number;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  category_type: string;
}

export interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  original_amount?: number;
  original_currency?: string;
  account_id: number;
  account_name: string;
  category_id?: number;
  category_name?: string;
  category_color?: string;
  category_source: string;
  is_income: boolean;
  is_internal_transfer: boolean;
  transaction_type: string;
}

export interface MonthlySummary {
  month: string;
  income: number;
  expenses: number;
  net?: number;
  savings_rate?: number;
}

export interface CategoryMonthly {
  month: string;
  categories: Record<string, { total: number; color: string }>;
}

export interface CategoryTotal {
  category: string;
  color: string;
  icon: string;
  total: number;
  count: number;
}
