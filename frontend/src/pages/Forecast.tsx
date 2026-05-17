import { useEffect, useState } from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getForecast, getMonthlySummary } from "../api";
import type { ForecastData, CategoryTrend, MonthlySummary } from "../types";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n);
}

function formatMonth(m: string) {
  try { return format(parseISO(m + "-01"), "MMM yy", { locale: pl }); }
  catch { return m; }
}

function R2Badge({ r2 }: { r2: number }) {
  const pct = Math.round(r2 * 100);
  const color = pct >= 75 ? "bg-green-100 text-green-700" : pct >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>
      R² {pct}%
    </span>
  );
}

function TrendCell({ slope, pct }: { slope: number; pct: number }) {
  if (Math.abs(slope) < 5) {
    return (
      <span className="flex items-center gap-1 text-slate-400 text-sm">
        <Minus className="w-3.5 h-3.5" /> stabilny
      </span>
    );
  }
  const growing = slope > 0;
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${growing ? "text-red-500" : "text-green-600"}`}>
      {growing ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {growing ? "+" : ""}{formatCurrency(slope)}/mies.
      <span className="text-xs font-normal opacity-70">({growing ? "+" : ""}{pct}%)</span>
    </span>
  );
}

export default function Forecast() {
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [historical, setHistorical] = useState<MonthlySummary[]>([]);
  const [historyMonths, setHistoryMonths] = useState(6);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getForecast(historyMonths, 3),
      getMonthlySummary(historyMonths),
    ]).then(([f, h]) => {
      setForecastData(f);
      setHistorical(h);
    }).finally(() => setLoading(false));
  }, [historyMonths]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-slate-400">Liczę regresję...</div>;
  }

  if (!forecastData || forecastData.category_trends.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Prognoza</h1>
        <p className="text-slate-400 text-sm">Brak wystarczających danych. Zaimportuj co najmniej 3 miesiące wyciągów.</p>
      </div>
    );
  }

  // Combined chart data: historical (solid) + forecast (lighter)
  const chartData = [
    ...historical.map((m) => ({
      name: formatMonth(m.month),
      income: m.income,
      expenses: m.expenses,
      isForecast: false,
    })),
    ...forecastData.overall_forecast.map((m) => ({
      name: formatMonth(m.month),
      income_f: m.income,
      expenses_f: m.expenses,
      isForecast: true,
    })),
  ];

  const nextMonth = forecastData.overall_forecast[0];
  const lastHistorical = historical[historical.length - 1];

  const expDelta = nextMonth && lastHistorical
    ? nextMonth.expenses - lastHistorical.expenses
    : 0;

  // Split trends for display
  const growing = forecastData.category_trends.filter((t) => t.trend_slope >= 5);
  const shrinking = forecastData.category_trends.filter((t) => t.trend_slope <= -5);
  const stable = forecastData.category_trends.filter((t) => Math.abs(t.trend_slope) < 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Prognoza</h1>
          <p className="text-slate-500 text-sm">Regresja liniowa na podstawie historii wydatków</p>
        </div>
        <select
          value={historyMonths}
          onChange={(e) => setHistoryMonths(Number(e.target.value))}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
        >
          <option value={3}>3 mies. historii</option>
          <option value={6}>6 mies. historii</option>
          <option value={12}>12 mies. historii</option>
        </select>
      </div>

      {/* Next month forecast cards */}
      {nextMonth && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <p className="text-sm text-slate-500 mb-1">Prognoza przychodów</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(nextMonth.income)}</p>
            <p className="text-xs text-slate-400 mt-1">{formatMonth(nextMonth.month)}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <p className="text-sm text-slate-500 mb-1">Prognoza wydatków</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(nextMonth.expenses)}</p>
            <p className={`text-xs mt-1 ${expDelta > 0 ? "text-red-400" : "text-green-500"}`}>
              {expDelta > 0 ? "+" : ""}{formatCurrency(expDelta)} vs poprzedni
            </p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <p className="text-sm text-slate-500 mb-1">Prognoza bilansu</p>
            <p className={`text-2xl font-bold ${nextMonth.net >= 0 ? "text-indigo-600" : "text-red-500"}`}>
              {formatCurrency(nextMonth.net)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{formatMonth(nextMonth.month)}</p>
          </div>
        </div>
      )}

      {/* Combined chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Historia i prognoza</h2>
        <p className="text-xs text-slate-400 mb-4">Słupki pełne — dane rzeczywiste · Słupki jasne — prognoza</p>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
            <Legend />
            {/* Actual data */}
            <Bar dataKey="income" name="Przychody" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" name="Wydatki" fill="#f87171" radius={[3, 3, 0, 0]} />
            {/* Forecast data — lighter */}
            <Bar dataKey="income_f" name="Przychody (prognoza)" fill="#86efac" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses_f" name="Wydatki (prognoza)" fill="#fca5a5" radius={[3, 3, 0, 0]} />
            {/* Separator between historical and forecast */}
            {historical.length > 0 && (
              <ReferenceLine
                x={formatMonth(historical[historical.length - 1].month)}
                stroke="#6366f1"
                strokeDasharray="4 4"
                label={{ value: "dziś", position: "top", fontSize: 10, fill: "#6366f1" }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Category trends table */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Trendy kategorii</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Posortowane wg siły trendu · R² = dopasowanie modelu (im wyższe, tym pewniejszy trend)
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left">
              <th className="px-5 py-3 text-slate-500 font-medium">Kategoria</th>
              <th className="px-5 py-3 text-slate-500 font-medium text-right">Średnia/mies.</th>
              <th className="px-5 py-3 text-slate-500 font-medium">Trend</th>
              <th className="px-5 py-3 text-slate-500 font-medium">Pewność</th>
              <th className="px-5 py-3 text-slate-500 font-medium text-right">
                Prognoza {forecastData.overall_forecast[0] ? formatMonth(forecastData.overall_forecast[0].month) : ""}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {[...growing, ...stable, ...shrinking].map((trend: CategoryTrend) => (
              <tr key={trend.category} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: trend.color }}
                    />
                    <span className="text-slate-700">{trend.icon} {trend.category}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right text-slate-600">{formatCurrency(trend.avg_monthly)}</td>
                <td className="px-5 py-3">
                  <TrendCell slope={trend.trend_slope} pct={trend.trend_pct_per_month} />
                </td>
                <td className="px-5 py-3">
                  <R2Badge r2={trend.r2} />
                </td>
                <td className="px-5 py-3 text-right font-medium text-slate-800">
                  {trend.forecast[0] ? formatCurrency(trend.forecast[0].predicted) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
