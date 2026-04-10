import { NavLink } from "react-router-dom";
import { LayoutDashboard, Upload, List, BarChart2, Settings, LogOut, TrendingUp } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const nav = [
  { to: "/financeplaner/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/financeplaner/upload", label: "Import PDF", icon: Upload },
  { to: "/financeplaner/transactions", label: "Transakcje", icon: List },
  { to: "/financeplaner/analytics", label: "Analityka", icon: BarChart2 },
  { to: "/financeplaner/settings", label: "Ustawienia", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-600" />
            <span className="font-bold text-slate-800 text-lg">FinancePlaner</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Wyloguj
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
