import { useEffect, useState } from "react";
import { Search, ArrowUpRight, ArrowDownLeft, RefreshCw } from "lucide-react";
import { listTransactions, listCategories, updateCategory, updateInternal, listAccounts } from "../api";
import type { Transaction, Category, Account } from "../types";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Math.abs(n));
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState<number | "">("");
  const [filterCategory, setFilterCategory] = useState<number | "">("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [includeInternal, setIncludeInternal] = useState(false);

  // Category edit
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    const params: any = { limit: 300 };
    if (filterAccount) params.account_id = filterAccount;
    if (filterCategory) params.category_id = filterCategory;
    if (filterType === "income") params.is_income = true;
    if (filterType === "expense") params.is_income = false;
    if (includeInternal) params.include_internal = true;
    if (search) params.search = search;

    listTransactions(params).then(setTransactions).finally(() => setLoading(false));
  };

  useEffect(() => {
    listCategories().then(setCategories);
    listAccounts().then(setAccounts);
  }, []);

  useEffect(() => { load(); }, [filterAccount, filterCategory, filterType, includeInternal]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleCategoryChange = async (txId: number, catId: number) => {
    await updateCategory(txId, catId);
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id !== txId) return t;
        const cat = categories.find((c) => c.id === catId);
        return { ...t, category_id: catId, category_name: cat?.name, category_color: cat?.color, category_source: "manual" };
      })
    );
    setEditingId(null);
  };

  const handleToggleInternal = async (tx: Transaction) => {
    await updateInternal(tx.id, !tx.is_internal_transfer);
    if (!includeInternal) {
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    } else {
      setTransactions((prev) => prev.map((t) => t.id === tx.id ? { ...t, is_internal_transfer: !t.is_internal_transfer } : t));
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Transakcje</h1>
        <p className="text-slate-500 text-sm">{transactions.length} transakcji</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-48 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szukaj opisu..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button type="submit" className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Szukaj</button>
          </form>

          {/* Account */}
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value ? Number(e.target.value) : "")}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="">Wszystkie konta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          {/* Category */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value ? Number(e.target.value) : "")}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="">Wszystkie kategorie</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>

          {/* Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="all">Wpływy + Wydatki</option>
            <option value="income">Tylko wpływy</option>
            <option value="expense">Tylko wydatki</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInternal}
              onChange={(e) => setIncludeInternal(e.target.checked)}
              className="rounded"
            />
            Pokaż przelewy wewnętrzne
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400">Ładowanie...</div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">Brak transakcji</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-3 text-slate-500 font-medium">Data</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Opis</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Kategoria</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Konto</th>
                <th className="px-4 py-3 text-slate-500 font-medium text-right">Kwota</th>
                <th className="px-4 py-3 text-slate-500 font-medium text-center">Wew.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{tx.date}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs">
                    <div className="truncate" title={tx.description}>{tx.description}</div>
                    {tx.original_currency && tx.original_currency !== "PLN" && (
                      <span className="text-xs text-slate-400">{tx.original_amount} {tx.original_currency}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === tx.id ? (
                      <select
                        autoFocus
                        defaultValue={tx.category_id || ""}
                        onChange={(e) => handleCategoryChange(tx.id, Number(e.target.value))}
                        onBlur={() => setEditingId(null)}
                        className="px-2 py-1 border border-indigo-400 rounded text-xs focus:outline-none"
                      >
                        <option value="">Brak kategorii</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditingId(tx.id)}
                        className="flex items-center gap-1.5 group"
                      >
                        {tx.category_color ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white group-hover:opacity-80"
                            style={{ backgroundColor: tx.category_color }}
                          >
                            {tx.category_name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 group-hover:text-slate-600">Bez kategorii</span>
                        )}
                        {tx.category_source === "manual" && (
                          <span className="text-xs text-slate-300">✏</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{tx.account_name}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className={`font-medium flex items-center justify-end gap-1 ${tx.is_income ? "text-green-600" : "text-slate-800"}`}>
                      {tx.is_income ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                      {formatCurrency(tx.amount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleInternal(tx)}
                      title="Oznacz jako przelew wewnętrzny"
                      className={`p-1 rounded transition-colors ${tx.is_internal_transfer ? "text-indigo-500 bg-indigo-50" : "text-slate-300 hover:text-slate-500"}`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
