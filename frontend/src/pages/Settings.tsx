import { useEffect, useState } from "react";
import { listUsers, createUser, listAccounts, deleteAccount } from "../api";
import type { User, Account } from "../types";
import { useAuth } from "../hooks/useAuth";
import { Trash2, UserPlus } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => {
    if (user?.is_admin) listUsers().then(setUsers);
    listAccounts().then(setAccounts);
  };

  useEffect(() => { refresh(); }, [user]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMsg(null);
    try {
      await createUser({ email: newEmail, name: newName, password: newPassword });
      setMsg({ ok: true, text: "Użytkownik dodany" });
      setNewEmail(""); setNewName(""); setNewPassword("");
      refresh();
    } catch (err: any) {
      setMsg({ ok: false, text: err.response?.data?.detail || "Błąd" });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!confirm("Usunąć konto i wszystkie wyciągi?")) return;
    await deleteAccount(id);
    refresh();
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800">Ustawienia</h1>

      {/* Accounts */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Konta bankowe</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{a.name}</p>
                <p className="text-xs text-slate-400">{a.bank} · {a.account_type} {a.iban ? `· ${a.iban}` : ""}</p>
              </div>
              {user?.is_admin && (
                <button
                  onClick={() => handleDeleteAccount(a.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="px-5 py-6 text-center text-slate-400 text-sm">Brak kont — dodaj je w zakładce Import PDF</div>
          )}
        </div>
      </div>

      {/* Users — admin only */}
      {user?.is_admin && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Użytkownicy</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email} {u.is_admin ? "· admin" : ""}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Add user form */}
          <div className="px-5 py-4 border-t border-slate-200">
            <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Dodaj domownika
            </p>
            <form onSubmit={handleCreateUser} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Imię"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <input
                type="password"
                placeholder="Hasło"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {msg && (
                <div className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {msg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={creating}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {creating ? "Dodawanie..." : "Dodaj użytkownika"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
