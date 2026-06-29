import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function localDateBounds(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const localMidnight = (d) => {
    const y = d.getFullYear(), m = pad(d.getMonth() + 1), day = pad(d.getDate());
    return new Date(`${y}-${m}-${day}T00:00:00`).toISOString();
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "daily") {
    return { start_date: localMidnight(today), end_date: localMidnight(new Date(today.getTime() + 86400000)) };
  }
  if (period === "weekly") {
    return { start_date: localMidnight(new Date(today.getTime() - 6 * 86400000)), end_date: localMidnight(new Date(today.getTime() + 86400000)) };
  }
  if (period === "monthly") {
    return { start_date: localMidnight(new Date(today.getFullYear(), today.getMonth(), 1)), end_date: localMidnight(new Date(today.getTime() + 86400000)) };
  }
  if (period === "yearly") {
    return { start_date: localMidnight(new Date(today.getFullYear(), 0, 1)), end_date: localMidnight(new Date(today.getTime() + 86400000)) };
  }
  return {};
}

export default function Reports() {
  const [period, setPeriod] = useState("monthly");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const bounds = localDateBounds(period);
    api.get("/reports/summary", { params: { period, ...bounds } })
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="mobile-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 animate-fade-up">
        <div>
          <div className="kpi-label">Financial Overview</div>
          <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">Reports</h1>
        </div>
        <div className="grid grid-cols-2 sm:flex border border-zinc-200 rounded-sm overflow-hidden w-full sm:w-auto">
          {["daily","weekly","monthly","yearly"].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors touch-target ${period === p ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-950"}`}>
              {p === "yearly" ? "annual" : p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-zinc-500">Loading…</div>
      ) : !data ? null : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 border border-zinc-200 mb-6 animate-fade-up">
            <div className="sm:border-r border-b sm:border-b-0 border-zinc-200 p-4 md:p-5">
              <div className="kpi-label text-[9px] md:text-[10px]">Total Credit</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                <span className="font-heading text-xl md:text-2xl font-bold tabular-nums text-green-700">
                  ₹{data.total_credit.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <div className="sm:border-r border-b sm:border-b-0 border-zinc-200 p-4 md:p-5">
              <div className="kpi-label text-[9px] md:text-[10px]">Total Debit</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                <span className="font-heading text-xl md:text-2xl font-bold tabular-nums text-red-600">
                  ₹{data.total_debit.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <div className="p-4 md:p-5">
              <div className="kpi-label text-[9px] md:text-[10px]">Net</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Minus className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <span className={`font-heading text-xl md:text-2xl font-bold tabular-nums ${data.net >= 0 ? "text-green-700" : "text-red-600"}`}>
                  ₹{Math.abs(data.net).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="border border-zinc-200 bg-white p-4 md:p-6 mb-6 animate-fade-up">
            <div className="kpi-label mb-4">Daily Transactions</div>
            <div className="h-56 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  barSize={period === "daily" ? 34 : period === "weekly" ? 28 : period === "yearly" ? 4 : 10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                    interval={period === "daily" || period === "weekly" ? 0 : period === "yearly" ? 30 : 4} />
                  <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    formatter={(v, name) => [`₹${v.toLocaleString("en-IN")}`, name === "credit" ? "Credit" : "Debit"]}
                    contentStyle={{ borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="credit" fill="#16A34A" name="credit" radius={[2,2,0,0]} />
                  <Bar dataKey="debit" fill="#DC2626" name="debit" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category breakdown */}
          {data.by_category?.length > 0 && (
            <div className="border border-zinc-200 bg-white animate-fade-up">
              <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
                <div className="kpi-label">Category Breakdown</div>
              </div>
              <ul className="divide-y divide-zinc-200">
                {data.by_category.sort((a,b) => (b.credit+b.debit)-(a.credit+a.debit)).map(c => (
                <li key={c.category} className="px-4 md:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="flex-1 text-sm font-medium">{c.category}</span>
                    {c.credit > 0 && (
                      <span className="text-xs font-mono text-green-700">+₹{c.credit.toLocaleString("en-IN")}</span>
                    )}
                    {c.debit > 0 && (
                      <span className="text-xs font-mono text-red-600">-₹{c.debit.toLocaleString("en-IN")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
