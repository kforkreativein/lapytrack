import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Boxes, ArrowDownToLine, ArrowUpFromLine, AlertTriangle,
  Download, Plus, TrendingUp, TrendingDown, IndianRupee, RefreshCw,
  Wrench, Laptop, Monitor,
} from "lucide-react";

function KpiCard({ label, value, icon: Icon, tone = "default", testId }) {
  const tones = {
    default: "border-zinc-200",
    danger: "border-red-200 bg-red-50/40",
    good: "border-blue-200 bg-blue-50/40",
  };
  return (
    <div data-testid={testId}
      className={`border ${tones[tone]} p-4 md:p-5 transition-colors duration-150 hover:bg-zinc-50/60`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="kpi-label text-[9px] md:text-[10px]">{label}</div>
          <div className="font-heading text-3xl md:text-4xl font-bold tabular-nums mt-1.5 md:mt-2 tracking-tight">
            {value}
          </div>
        </div>
        <Icon className="w-4 h-4 text-zinc-400" strokeWidth={2} />
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function fmt(n) { return `₹${Number(n || 0).toLocaleString("en-IN")}`; }

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => (await api.get("/stats")).data,
    retry: 2,
    retryDelay: 5000,
  });
  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["ledger-dashboard"],
    queryFn: async () => (await api.get("/ledger/dashboard")).data,
    retry: 2,
    retryDelay: 5000,
  });
  const loading = statsLoading;

  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (!loading) { setSlowLoad(false); return; }
    const t = setTimeout(() => setSlowLoad(true), 4000);
    return () => clearTimeout(t);
  }, [loading]);

  const handleExport = async () => {
    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/devices/export/csv`, {
      credentials: "include",
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "devices.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mobile-page" data-testid="dashboard-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 md:mb-8 animate-fade-up">
        <div>
          <div className="kpi-label">Operational Overview</div>
          <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">Dashboard</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:w-auto">
          <Button
            variant="outline"
            onClick={handleExport}
            data-testid="export-csv-button"
            className="flex-1 md:flex-none rounded-sm border-zinc-300 h-10"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
          <Link to="/inward" className="flex-1 md:flex-none">
            <Button data-testid="new-inward-button" className="w-full rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Inward
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <div className="text-sm text-zinc-500">Loading…</div>
          {slowLoad && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2.5 rounded-sm max-w-sm">
              Backend is waking up — this takes up to 60 seconds on first visit. Hang tight.
              <button
                onClick={() => queryClient.invalidateQueries()}
                className="ml-2 underline font-medium hover:text-amber-900"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      ) : statsError ? (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded-sm max-w-sm flex items-center gap-2">
          Failed to load data.
          <button onClick={() => queryClient.invalidateQueries()} className="underline font-medium flex items-center gap-1 hover:text-red-900">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-200 mb-6 md:mb-10 animate-fade-up">
            <div className="border-r border-b lg:border-b-0 border-zinc-200">
              <KpiCard label="Total Devices" value={stats.total} icon={Boxes} testId="kpi-total" />
            </div>
            <div className="border-b lg:border-b-0 lg:border-r border-zinc-200">
              <KpiCard label="In Stock" value={stats.in_stock} icon={ArrowDownToLine} tone="good" testId="kpi-in-stock" />
            </div>
            <div className="border-r border-zinc-200">
              <KpiCard label="Issued / Out" value={stats.issued} icon={ArrowUpFromLine} testId="kpi-issued" />
            </div>
            <KpiCard label="Overdue" value={stats.overdue} icon={AlertTriangle} tone={stats.overdue > 0 ? "danger" : "default"} testId="kpi-overdue" />
          </div>

          {/* Financial KPIs */}
          {ledgerLoading ? (
            <div className="border border-zinc-200 mb-6 md:mb-10 bg-zinc-50 p-4 md:p-5 text-sm text-zinc-500">
              Loading financial summary…
            </div>
          ) : ledger && (
          <div className="grid grid-cols-1 sm:grid-cols-3 border border-zinc-200 mb-6 md:mb-10 bg-white animate-fade-up">
              <div className="sm:border-r border-b sm:border-b-0 border-zinc-200 p-4 md:p-5">
                <div className="kpi-label text-[9px] md:text-[10px]">Net Balance</div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <IndianRupee className="w-3 h-3 text-zinc-400 flex-shrink-0 mt-1" />
                  <span className={`font-heading text-2xl md:text-3xl font-bold tabular-nums ${ledger.net_balance >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {Math.abs(ledger.net_balance).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
              <div className="sm:border-r border-b sm:border-b-0 border-zinc-200 p-4 md:p-5">
                <div className="kpi-label text-[9px] md:text-[10px]">You'll Get</div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <TrendingUp className="w-3 h-3 text-green-600 flex-shrink-0 mt-1" />
                  <span className="font-heading text-2xl md:text-3xl font-bold tabular-nums text-green-700">
                    {ledger.total_credit.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
              <div className="p-4 md:p-5">
                <div className="kpi-label text-[9px] md:text-[10px]">You'll Give</div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <TrendingDown className="w-3 h-3 text-red-600 flex-shrink-0 mt-1" />
                  <span className="font-heading text-2xl md:text-3xl font-bold tabular-nums text-red-600">
                    {ledger.total_debit.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Device secondary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 border border-zinc-200 mb-6 md:mb-10 bg-white">
            <div className="sm:border-r border-b sm:border-b-0 border-zinc-200 p-4 md:p-5">
              <div className="kpi-label text-[9px] md:text-[10px]">In Repair</div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="font-heading text-2xl md:text-3xl font-bold tabular-nums">{stats.in_repair}</span>
                <Wrench className="w-3 h-3 text-amber-600" />
              </div>
            </div>
            <div className="sm:border-r border-b sm:border-b-0 border-zinc-200 p-4 md:p-5">
              <div className="kpi-label text-[9px] md:text-[10px]">Laptops</div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="font-heading text-2xl md:text-3xl font-bold tabular-nums">{stats.laptops}</span>
                <Laptop className="w-3 h-3 text-zinc-400" />
              </div>
            </div>
            <div className="p-4 md:p-5">
              <div className="kpi-label text-[9px] md:text-[10px]">Desktops</div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="font-heading text-2xl md:text-3xl font-bold tabular-nums">{stats.desktops}</span>
                <Monitor className="w-3 h-3 text-zinc-400" />
              </div>
            </div>
          </div>

          {/* Recent movements */}
          <div className="border border-zinc-200 bg-white">
            <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
              <div>
                <div className="kpi-label">Activity Feed</div>
                <h3 className="font-heading text-sm md:text-base font-semibold mt-0.5">Recent Movements</h3>
              </div>
              <Link to="/devices" className="text-xs font-semibold text-zinc-950 hover:underline">
                View all →
              </Link>
            </div>
            {stats.recent_movements?.length === 0 ? (
              <div className="p-10 text-center text-sm text-zinc-500">
                No movements recorded yet. Start by logging a new inward.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-200" data-testid="recent-movements-list">
                {stats.recent_movements?.map((m) => (
                  <li key={m.movement_id} className="px-4 md:px-5 py-3 flex items-start gap-3 hover:bg-zinc-50">
                    <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm ${
                      m.movement_type === "outward" ? "bg-zinc-100 text-zinc-700" : "bg-blue-50 text-blue-700"
                    }`}>
                      {m.movement_type === "outward"
                        ? <ArrowUpFromLine className="w-4 h-4" />
                        : <ArrowDownToLine className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-bold bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded-sm">
                          {m.job_number || m.device_id}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">{m.movement_type}</span>
                      </div>
                      <div className="text-xs text-zinc-600 mt-1 truncate">
                        {m.movement_type === "outward"
                          ? (m.picked_up_by_name || "—")
                          : (m.customer_name || "—")}
                      </div>
                      <div className="sm:hidden text-[11px] text-zinc-500 font-mono mt-1">
                        {formatDate(m.created_at)}
                      </div>
                    </div>
                    <div className="hidden sm:block text-[11px] text-zinc-500 font-mono whitespace-nowrap">
                      {formatDate(m.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
