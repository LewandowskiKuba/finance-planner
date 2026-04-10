import { useState, useEffect, useRef } from "react";
import { Upload as UploadIcon, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { listAccounts, listStatements, uploadStatement, deleteStatement, createAccount } from "../api";
import type { Account, Statement } from "../types";

const BANKS = [
  { value: "millennium", label: "Bank Millennium" },
  { value: "pekao", label: "Bank Pekao" },
  { value: "other", label: "Inny" },
];

export default function Upload() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // New account form
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccBank, setNewAccBank] = useState("millennium");
  const [newAccType, setNewAccType] = useState("personal");
  const [newAccIban, setNewAccIban] = useState("");

  const refresh = () => {
    listAccounts().then(setAccounts);
    listStatements().then(setStatements);
  };

  useEffect(() => { refresh(); }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") setFile(f);
  };

  const handleUpload = async () => {
    if (!file || !selectedAccount) return;
    setUploading(true);
    setResult(null);
    try {
      const data = await uploadStatement(file, selectedAccount as number);
      setResult({ ok: true, msg: `Zaimportowano ${data.transactions_imported} transakcji (${data.period_start} – ${data.period_end})` });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Błąd importu";
      setResult({ ok: false, msg });
    } finally {
      setUploading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccName.trim()) return;
    await createAccount({ name: newAccName, bank: newAccBank, account_type: newAccType, iban: newAccIban || undefined });
    setShowNewAccount(false);
    setNewAccName(""); setNewAccIban("");
    refresh();
  };

  const handleDeleteStatement = async (id: number) => {
    if (!confirm("Usunąć wyciąg i wszystkie jego transakcje?")) return;
    await deleteStatement(id);
    refresh();
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Import wyciągów PDF</h1>
        <p className="text-slate-500 text-sm">Obsługiwane banki: Bank Millennium, Bank Pekao</p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {/* Account select */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Konto bankowe</label>
          <div className="flex gap-2">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value ? Number(e.target.value) : "")}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Wybierz konto...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.bank})</option>
              ))}
            </select>
            <button
              onClick={() => setShowNewAccount(!showNewAccount)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
            >
              + Nowe konto
            </button>
          </div>
        </div>

        {/* New account form */}
        {showNewAccount && (
          <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <p className="text-sm font-medium text-slate-700">Nowe konto</p>
            <input
              placeholder="Nazwa konta (np. Millennium prywatne)"
              value={newAccName}
              onChange={(e) => setNewAccName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newAccBank}
                onChange={(e) => setNewAccBank(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
              >
                {BANKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <select
                value={newAccType}
                onChange={(e) => setNewAccType(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
              >
                <option value="personal">Prywatne</option>
                <option value="business">Firmowe (JDG)</option>
              </select>
            </div>
            <input
              placeholder="IBAN (opcjonalnie, do wykrywania przelewów wewnętrznych)"
              value={newAccIban}
              onChange={(e) => setNewAccIban(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none"
            />
            <button
              onClick={handleCreateAccount}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
            >
              Dodaj konto
            </button>
          </div>
        )}

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
        >
          <UploadIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          {file ? (
            <p className="text-sm text-indigo-700 font-medium">{file.name}</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">Przeciągnij plik PDF lub kliknij aby wybrać</p>
              <p className="text-xs text-slate-400 mt-1">Wyciąg PDF z Banku Millennium lub Pekao</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        {result && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {result.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
            {result.msg}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || !selectedAccount || uploading}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {uploading ? "Importowanie i kategoryzowanie (AI)..." : "Importuj wyciąg"}
        </button>
      </div>

      {/* Statements list */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Zaimportowane wyciągi</h2>
        </div>
        {statements.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">Brak wyciągów</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {statements.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{s.account_name}</p>
                  <p className="text-xs text-slate-500">
                    {s.period_start} – {s.period_end} · {s.transaction_count} transakcji · {s.filename}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteStatement(s.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
