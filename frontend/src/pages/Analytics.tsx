import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import { getCategoryMonthly, getCategoryTrend, listCategories } from "../api";
import type { Category, CategoryMonthly } from "../types";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

function formatMonth(m: string) {
  try { return format(parseISO(m + "-01"), "MMM yy", { locale: pl }); }
  catch { return m; }
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n);
}

export default function Analytics() {
  const [categoryMonthly, setCategoryMonthly] = useState<CategoryMonthly[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | "">("");
  const [trendData, setTrendData] = useState<any[]>([]);
  const [months, setMonths] = useState(12);

  useEffect(() => {
    listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    getCategoryMonthly(months).then(setCategoryMonthly);
  }, [months]);

  useEffect(() => {
    if (!selectedCategory) return;
    getCategoryTrend(selectedCategory, months).then((data) => {
      setTrendData(data.map((d: any) => ({ ...d, name: formatMonth(d.month) })));
    });
  }, [selectedCategory, months]);

  // Prepare stacked bar data
  const allCategories = Array.from(
    new Set(categoryMonthly.flatMap((m) => Object.keys(m.categories)))
  );

  const stackedData = categoryMonthly.map((m) => {
    const row: any = { name: formatMonth(m.month) };
    allCategories.forEach((cat) => {
      row[cat] = m.categories[cat]?.total || 0;
    });
    return row;
  });

  const catColorMap: Record<string, string> = {};
  categoryMonthly.forEach((m) => {
    Object.entries(m.categories).forEach(([name, { color }]) => {
      catColorMap[name] = color;
    });
  });

  // Category MoM change table
  const lastTwo = categoryMonthly.slice(-2);
  const momData = allCategories.map((cat) => {
    const current = lastTwo[1]?.categories[cat]?.total || 0;
    const previous = lastTwo[0]?.categories[cat]?.total || 0;
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    return { cat, current, previous, change };
  }).filter((r) => r.current > 0 || r.previous > 0).sort((a, b) => b.current - a.current);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analityka</h1>
          <p className="text-slate-500 text-sm">Trendy wydatków wg kategorii</p>
        </div>
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
        >
          <option value={6}>6 miesięcy</option>
          <option value={12}>12 miesięcy</option>
          <option value={24}>24 miesiące</option>
        </select>
      </div>

      {/* Stacked bar — all categories */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Wydatki wg kategorii miesięcznie</h2>
        {stackedData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Brak danych. Importuj wyciągi PDF.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={stackedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
              {allCategories.map((cat) => (
                <Bar key={cat} dataKey={cat} stackId="a" fill={catColorMap[cat] || "#94a3b8"} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* MoM changes table */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Zmiany miesiąc do miesiąca</h2>
          {lastTwo.length >= 2 && (
            <p className="text-xs text-slate-400 mt-0.5">
              {formatMonth(lastTwo[0]?.month)} → {formatMonth(lastTwo[1]?.month)}
            </p>
          )}
        </div>
        <div className="divide-y divide-slate-50">
          {momData.map((row) => (
            <div key={row.cat} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: catColorMap[row.cat] || "#94a3b8" }}
                />
                <span className="text-sm text-slate-700">{row.cat}</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="text-sm text-slate-500">{formatCurrency(row.previous)}</span>
                <span className="text-sm font-medium text-slate-800">{formatCurrency(row.current)}</span>
                <span className={`text-sm font-medium w-16 text-right ${row.change > 5 ? "text-red-500" : row.change < -5 ? "text-green-600" : "text-slate-400"}`}>
                  {row.change > 0 ? "+" : ""}{row.change.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
          {momData.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-400 text-sm">Brak danych</div>
          )}
        </div>
      </div>

      {/* Single category trend */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Trend kategorii</h2>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="">Wybierz kategorię...</option>
            {categories.filter((c) => c.category_type === "expense").map((c) => (
              <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
        {trendData.length === 0 ? (
          <div className="h-36 flex items-center justify-center text-slate-400 text-sm">
            {selectedCategory ? "Brak danych dla tej kategorii" : "Wybierz kategorię"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <ReferenceLine
                y={trendData.reduce((s, d) => s + d.total, 0) / trendData.length}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: "śr.", position: "right", fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="total"
                name={selectedCategory}
                stroke={catColorMap[selectedCategory] || "#6366f1"}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
