import { useEffect, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Treemap } from "recharts";
import { TrendingUp, TrendingDown, Minus, Wallet, Clock } from "lucide-react";
import { getMonthlySummary, getCategoryTotals, getIncomeVsExpenses } from "../api";
import type { MonthlySummary, CategoryTotal } from "../types";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

const fmt = (n: number) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n);

function formatMonth(m: string) {
  try { return format(parseISO(m + "-01"), "MMM yy", { locale: pl }); }
  catch { return m; }
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
        <div className="p-2 rounded-lg bg-slate-50">
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

function TreemapCell({ x, y, width, height, name, size, fill }: any) {
  const tooSmall = width < 70 || height < 40;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} style={{ borderRadius: 4 }} />
      {!tooSmall && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 7} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={600} style={{ pointerEvents: "none" }}>
            {name.length > 16 ? name.slice(0, 15) + "…" : name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={10} style={{ pointerEvents: "none" }}>
            {fmt(size)}
          </text>
        </>
      )}
    </g>
  );
}

function TreemapTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow">
      <p className="font-medium text-slate-800">{d.name}</p>
      <p className="text-slate-500">{fmt(d.size)}</p>
    </div>
  );
}

export default function Dashboard() {
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [incomeVsExp, setIncomeVsExp] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [treemapMonth, setTreemapMonth] = useState<string>("all");
  const [treemapLoading, setTreemapLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      getMonthlySummary(12),
      getIncomeVsExpenses(12),
    ]).then(([m, ive]) => {
      setMonthly(m);
      setIncomeVsExp(ive);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (treemapMonth === "all") {
      setTreemapLoading(true);
      getCategoryTotals().then(setCategoryTotals).finally(() => setTreemapLoading(false));
      return;
    }
    const [year, month] = treemapMonth.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dateFrom = `${treemapMonth}-01`;
    const dateTo = `${treemapMonth}-${String(lastDay).padStart(2, "0")}`;
    setTreemapLoading(true);
    getCategoryTotals(dateFrom, dateTo).then(setCategoryTotals).finally(() => setTreemapLoading(false));
  }, [treemapMonth]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-slate-400">Ładowanie...</div>;
  }

  const lastMonth = monthly[monthly.length - 1];
  const prevMonth = monthly[monthly.length - 2];

  const expenseTrend = lastMonth && prevMonth
    ? ((lastMonth.expenses - prevMonth.expenses) / prevMonth.expenses * 100).toFixed(1)
    : null;

  // Siła nabywcza roboczogodziny: income × (1-VAT 23%) × (1-PIT 15%) / 160h
  const hourlyRate = lastMonth
    ? Math.round(lastMonth.income * 0.77 * 0.85 / 160)
    : null;

  const chartData = monthly.map((m) => ({ ...m, name: formatMonth(m.month) }));

  const treemapData = categoryTotals.map((c) => ({
    name: c.icon ? `${c.icon} ${c.category}` : c.category,
    size: c.total,
    fill: c.color,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm">Przegląd finansów — ostatnie 12 miesięcy</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          label="Wydatki (ostatni mies.)"
          value={lastMonth ? fmt(lastMonth.expenses) : "—"}
          sub={expenseTrend ? `${Number(expenseTrend) > 0 ? "+" : ""}${expenseTrend}% vs poprzedni` : undefined}
          icon={TrendingDown}
          color="text-red-500"
        />
        <StatCard
          label="Przychody (ostatni mies.)"
          value={lastMonth ? fmt(lastMonth.income) : "—"}
          icon={TrendingUp}
          color="text-green-600"
        />
        <StatCard
          label="Bilans (ostatni mies.)"
          value={lastMonth ? fmt(lastMonth.net ?? lastMonth.income - lastMonth.expenses) : "—"}
          icon={Wallet}
          color={(lastMonth?.net ?? 0) >= 0 ? "text-indigo-600" : "text-red-500"}
        />
        <StatCard
          label="Stopa oszczędności"
          value={lastMonth?.savings_rate != null ? `${lastMonth.savings_rate}%` : "—"}
          icon={Minus}
          color="text-slate-600"
        />
        <StatCard
          label="1h pracy netto"
          value={hourlyRate != null ? fmt(hourlyRate) : "—"}
          sub="po VAT 23% i PIT 15%"
          icon={Clock}
          color="text-amber-600"
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
            <Tooltip formatter={(v: any) => fmt(Number(v))} />
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
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Line type="monotone" dataKey="net" name="Netto" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Treemap — category spend weight */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-base font-semibold text-slate-800">Struktura wydatków</h2>
            <select
              value={treemapMonth}
              onChange={(e) => setTreemapMonth(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-lg text-xs focus:outline-none"
            >
              <option value="all">Ostatnie 12 mies.</option>
              {[...monthly].reverse().map((m) => (
                <option key={m.month} value={m.month}>{formatMonth(m.month)}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-400 mb-3">Rozmiar prostokąta = udział w łącznych wydatkach</p>
          {treemapLoading ? (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Ładowanie...</div>
          ) : treemapData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Brak danych</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <Treemap
                data={treemapData}
                dataKey="size"
                stroke="#fff"
                content={<TreemapCell />}
              >
                <Tooltip content={<TreemapTooltip />} />
              </Treemap>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
