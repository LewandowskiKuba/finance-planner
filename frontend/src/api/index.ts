import client from "./client";

// Auth
export const login = (email: string, password: string) =>
  client.post("/auth/login", { email, password }).then((r) => r.data);

export const me = () => client.get("/auth/me").then((r) => r.data);

export const listUsers = () => client.get("/auth/users").then((r) => r.data);

export const createUser = (data: { email: string; name: string; password: string }) =>
  client.post("/auth/users", data).then((r) => r.data);

// Accounts
export const listAccounts = () => client.get("/accounts").then((r) => r.data);

export const createAccount = (data: { name: string; bank: string; account_type: string; iban?: string }) =>
  client.post("/accounts", data).then((r) => r.data);

export const deleteAccount = (id: number) =>
  client.delete(`/accounts/${id}`).then((r) => r.data);

// Statements
export const listStatements = () => client.get("/statements").then((r) => r.data);

export const uploadStatement = (file: File, accountId: number) => {
  const form = new FormData();
  form.append("file", file);
  form.append("account_id", accountId.toString());
  return client.post("/statements/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then((r) => r.data);
};

export const deleteStatement = (id: number) =>
  client.delete(`/statements/${id}`).then((r) => r.data);

// Transactions
export const listTransactions = (params?: {
  account_id?: number;
  category_id?: number;
  date_from?: string;
  date_to?: string;
  is_income?: boolean;
  include_internal?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}) => client.get("/transactions", { params }).then((r) => r.data);

export const updateCategory = (txId: number, categoryId: number) =>
  client.patch(`/transactions/${txId}/category`, { category_id: categoryId }).then((r) => r.data);

export const updateInternal = (txId: number, isInternal: boolean) =>
  client.patch(`/transactions/${txId}/internal`, { is_internal_transfer: isInternal }).then((r) => r.data);

export const listCategories = () =>
  client.get("/transactions/categories").then((r) => r.data);

// Analytics
export const getMonthlySummary = (months = 12) =>
  client.get("/analytics/monthly-summary", { params: { months } }).then((r) => r.data);

export const getCategoryMonthly = (months = 12) =>
  client.get("/analytics/category-monthly", { params: { months } }).then((r) => r.data);

export const getCategoryTotals = (dateFrom?: string, dateTo?: string) =>
  client.get("/analytics/category-totals", { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data);

export const getCategoryTrend = (categoryName: string, months = 12) =>
  client.get("/analytics/category-trend", { params: { category_name: categoryName, months } }).then((r) => r.data);

export const getIncomeVsExpenses = (months = 12) =>
  client.get("/analytics/income-vs-expenses", { params: { months } }).then((r) => r.data);
