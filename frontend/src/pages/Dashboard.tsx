import { useEffect, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, TrendingDown, Minus, Wallet } from "lucide-react";
import { getMonthlySummary, getCategoryTotals, getIncomeVsExpenses } from "../api";
import type { MonthlySummary, CategoryTotal } from "../types";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n);
}

function formatMonth(m: string) {
  try {
    return format(parseISO(m + "-01"), "MMM yy", { locale: pl });
  } catch {
    return m;
  }
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-slate-50`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [incomeVsExp, setIncomeVsExp] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getMonthlySummary(12),
      getCategoryTotals(),
      getIncomeVsExpenses(12),
    ]).then(([m, c, ive]) => {
      setMonthly(m);
      setCategoryTotals(c.slice(0, 8));
      setIncomeVsExp(ive);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-slate-400">Ładowanie...</div>;
  }

  const lastMonth = monthly[monthly.length - 1];
  const prevMonth = monthly[monthly.length - 2];

  const expenseTrend = lastMonth && prevMonth
    ? ((lastMonth.expenses - prevMonth.expenses) / prevMonth.expenses * 100).toFixed(1)
    : null;

  const chartData = monthly.map((m) => ({
    ...m,
    name: formatMonth(m.month),
  }));

  const pieData = categoryTotals.map((c) => ({ name: c.category, value: c.total, color: c.color }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm">Przegląd finansów — ostatnie 12 miesięcy</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Wydatki (last mo.)"
          value={lastMonth ? formatCurrency(lastMonth.expenses) : "—"}
          sub={expenseTrend ? `${Number(expenseTrend) > 0 ? "+" : ""}${expenseTrend}% vs poprzedni` : undefined}
          icon={TrendingDown}
          color="text-red-500"
        />
        <StatCard
          label="Przychody (last mo.)"
          value={lastMonth ? formatCurrency(lastMonth.income) : "—"}
          icon={TrendingUp}
          color="text-green-600"
        />
        <StatCard
          label="Bilans (last mo.)"
          value={lastMonth ? formatCurrency((lastMonth.net ?? lastMonth.income - lastMonth.expenses)) : "—"}
          icon={Wallet}
          color={(lastMonth?.net ?? 0) >= 0 ? "text-indigo-600" : "text-red-500"}
        />
        <StatCard
          label="Stopa oszczędności"
          value={lastMonth?.savings_rate != null ? `${lastMonth.savings_rate}%` : "—"}
          icon={Minus}
          color="text-slate-600"
        />
      </div>

      {/* Income vs Expenses bar chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Przychody vs Wydatki</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
            <Legend />
            <Bar dataKey="income" name="Przychody" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Wydatki" fill="#f87171" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Net savings line */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Bilans miesięczny (netto)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={incomeVsExp.map((m) => ({ ...m, name: formatMonth(m.month) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Line
                type="monotone"
                dataKey="net"
                name="Netto"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category pie */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Wydatki wg kategorii (12 mies.)</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Brak danych</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={false}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
