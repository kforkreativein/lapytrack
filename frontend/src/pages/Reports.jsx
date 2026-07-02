import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp, TrendingDown, Minus, Printer, Clock, CheckCircle2,
  PackageCheck, Wrench, AlertCircle, Users, Target, Laptop, RotateCcw,
} from "lucide-react";

const INR = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const PIE_COLORS = ["#6366F1","#F59E0B","#10B981","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316","#0EA5E9","#84CC16"];

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

// GitHub-style contribution heatmap — valueKey="amount" (INR) or "count" (integer)
// scheme="blue" (revenue) or "green" (inward devices)
function CalendarHeatmap({ data, valueKey = "amount", scheme = "blue" }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const byDate = {};
  data.forEach(d => { byDate[d.date] = d[valueKey]; });
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);

  const start = new Date(today);
  start.setDate(start.getDate() - 90);
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);

  const weeks = [];
  const monthLabels = [];
  let cur = new Date(start);
  for (let w = 0; w < 14; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const ds = cur.toISOString().slice(0, 10);
      if (cur.getDate() === 1 || (w === 0 && d === 0))
        monthLabels.push({ week: w, label: cur.toLocaleDateString("en-IN", { month: "short" }) });
      week.push({ date: ds, val: byDate[ds] || 0, future: cur > today, isToday: ds === todayStr });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const B = scheme === "green"
    ? ["bg-zinc-100","bg-green-100","bg-green-300","bg-green-500","bg-green-700","bg-green-900"]
    : ["bg-zinc-100","bg-blue-100","bg-blue-300","bg-blue-500","bg-blue-700","bg-blue-900"];

  const color = (val, future) => {
    if (future) return "bg-zinc-50 border border-zinc-100";
    if (val === 0) return B[0];
    const r = val / maxVal;
    if (r < 0.15) return B[1];
    if (r < 0.35) return B[2];
    if (r < 0.6)  return B[3];
    if (r < 0.8)  return B[4];
    return B[5];
  };

  const tooltip = (day) => {
    if (!day.val) return day.date;
    return valueKey === "amount" ? `${day.date}: ${INR(day.val)}` : `${day.date}: ${day.val} device${day.val !== 1 ? "s" : ""}`;
  };

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block min-w-full">
        <div className="flex gap-1 mb-1">
          {weeks.map((_, wi) => {
            const lbl = monthLabels.find(m => m.week === wi);
            return (
              <div key={wi} className="w-3.5 text-[9px] text-zinc-400 font-medium text-center" style={{ minWidth: 14 }}>
                {lbl ? lbl.label : ""}
              </div>
            );
          })}
        </div>
        <div className="flex gap-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => (
                <div key={di}
                  className={`w-3.5 h-3.5 rounded-sm cursor-default ${color(day.val, day.future)} ${day.isToday ? "ring-1 ring-zinc-950 ring-offset-1" : ""}`}
                  title={tooltip(day)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-2 justify-end">
          <span className="text-[9px] text-zinc-400">Less</span>
          {B.map((c, i) => <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />)}
          <span className="text-[9px] text-zinc-400">More</span>
        </div>
      </div>
    </div>
  );
}

function SectionBox({ title, children, className = "" }) {
  return (
    <div className={`border border-zinc-200 bg-white mb-6 ${className}`}>
      <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
        <div className="kpi-label">{title}</div>
      </div>
      {children}
    </div>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("monthly");
  const [data, setData] = useState(null);
  const [adv, setAdv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [goalInput, setGoalInput] = useState("");
  const [goal, setGoal] = useState(() => {
    const saved = localStorage.getItem("kc_monthly_goal");
    return saved ? Number(saved) : 0;
  });
  const [editingGoal, setEditingGoal] = useState(false);

  useEffect(() => {
    setLoading(true);
    const bounds = localDateBounds(period);
    Promise.all([
      api.get("/reports/summary", { params: { period, ...bounds } }),
      api.get("/reports/advanced", { params: { period, ...bounds } }),
    ]).then(([r1, r2]) => { setData(r1.data); setAdv(r2.data); })
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="mobile-page" id="reports-root">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 animate-fade-up print:mb-4">
        <div>
          <div className="kpi-label">Financial Overview</div>
          <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">Reports</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="grid grid-cols-4 border border-zinc-200 rounded-sm overflow-hidden print:hidden">
            {[["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"],["yearly","Annual"]].map(([v,l]) => (
              <button key={v} onClick={() => setPeriod(v)}
                className={`px-3 md:px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors touch-target ${period === v ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-950"}`}>
                {l}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => window.print()}
            className="rounded-sm border-zinc-300 h-10 text-xs print:hidden">
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Export PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-sm text-zinc-500">Loading reports…</div>
      ) : !data ? null : (
        <>
          {/* ── 1. Summary KPIs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 border border-zinc-200 mb-6 animate-fade-up">
            {[
              { label: "Total Credit", value: data.total_credit, icon: TrendingUp, cls: "text-green-700", iconCls: "text-green-600" },
              { label: "Total Debit",  value: data.total_debit,  icon: TrendingDown, cls: "text-red-600", iconCls: "text-red-600" },
              { label: `Net ${data.net >= 0 ? "(Profit)" : "(Loss)"}`, value: Math.abs(data.net), icon: data.net >= 0 ? TrendingUp : TrendingDown, cls: data.net >= 0 ? "text-green-700" : "text-red-600", iconCls: data.net >= 0 ? "text-green-600" : "text-red-600" },
            ].map(({ label, value, icon: Icon, cls, iconCls }, i) => (
              <div key={label} className={`p-4 md:p-5 ${i < 2 ? "sm:border-r border-b sm:border-b-0 border-zinc-200" : ""}`}>
                <div className="kpi-label text-[9px] md:text-[10px]">{label}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconCls}`} />
                  <span className={`font-heading text-xl md:text-2xl font-bold tabular-nums ${cls}`}>{INR(value)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── 3. Credit Sales Tracker ── */}
          {adv?.credit_sales && (
            <SectionBox title="Credit Sales Tracker">
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200">
                {[
                  { label: "Sold on Credit", value: adv.credit_sales.total_on_credit, cls: "text-zinc-950" },
                  { label: "Collected",       value: adv.credit_sales.total_collected, cls: "text-green-700" },
                  { label: "Still Pending",   value: adv.credit_sales.total_pending,  cls: "text-amber-700" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="p-4 md:p-5">
                    <div className="kpi-label text-[9px]">{label}</div>
                    <div className={`font-heading text-2xl font-bold mt-1.5 tabular-nums ${cls}`}>{INR(value)}</div>
                  </div>
                ))}
              </div>
            </SectionBox>
          )}

          {/* ── 4. Devices Summary ── */}
          {adv?.devices && (
            <SectionBox title={
              <span className="flex items-center justify-between w-full">
                <span>Devices Summary</span>
                {adv.devices.avg_turnaround_days !== null && (
                  <span className="flex items-center gap-1.5 text-[10px] font-normal text-zinc-500 normal-case tracking-normal">
                    <Clock className="w-3 h-3" />
                    Avg turnaround: <strong className="text-zinc-950">{adv.devices.avg_turnaround_days} days</strong>
                  </span>
                )}
              </span>
            }>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200">
                {[
                  { label: "Received",    value: adv.devices.received,   icon: Wrench,       cls: "text-blue-600" },
                  { label: "Completed",   value: adv.devices.completed,  icon: CheckCircle2, cls: "text-green-600" },
                  { label: "Delivered",   value: adv.devices.delivered,  icon: PackageCheck, cls: "text-emerald-600" },
                  { label: "In Progress", value: adv.devices.pending,    icon: AlertCircle,  cls: "text-amber-600" },
                ].map(({ label, value, icon: Icon, cls }) => (
                  <div key={label} className="p-4 md:p-5">
                    <div className="kpi-label text-[9px] flex items-center gap-1.5">
                      <Icon className={`w-3 h-3 ${cls}`} />{label}
                    </div>
                    <div className={`font-heading text-3xl font-bold mt-1.5 tabular-nums ${cls}`}>{value}</div>
                  </div>
                ))}
              </div>
            </SectionBox>
          )}

          {/* ── 5. Daily Bar + Category Donut ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
            <div className="border border-zinc-200 bg-white p-4 md:p-5">
              <div className="kpi-label mb-4">Daily Transactions</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                    barSize={period === "daily" ? 34 : period === "weekly" ? 28 : period === "yearly" ? 4 : 10}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                      interval={period === "daily" || period === "weekly" ? 0 : period === "yearly" ? 30 : 4} />
                    <YAxis tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                      tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                    <Tooltip formatter={(v, n) => [INR(v), n === "credit" ? "Credit" : "Debit"]}
                      contentStyle={{ borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 11 }} />
                    <Bar dataKey="credit" fill="#16A34A" radius={[2,2,0,0]} name="credit" />
                    <Bar dataKey="debit" fill="#DC2626" radius={[2,2,0,0]} name="debit" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {data.by_category?.length > 0 && (
              <div className="border border-zinc-200 bg-white p-4 md:p-5">
                <div className="kpi-label mb-4">Category Breakdown</div>
                <div className="flex items-center gap-4">
                  <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.by_category.map(c => ({ name: c.category, value: Math.round(c.credit + c.debit) }))}
                          cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" strokeWidth={1} stroke="#fff">
                          {data.by_category.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={v => [INR(v)]} contentStyle={{ borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1.5 min-w-0 flex-1 text-xs">
                    {[...data.by_category].sort((a,b) => (b.credit+b.debit)-(a.credit+a.debit)).slice(0,7).map((c, i) => (
                      <li key={c.category} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="truncate flex-1 text-zinc-700">{c.category}</span>
                        <span className="font-mono text-zinc-600 flex-shrink-0">{INR(c.credit + c.debit)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* ── 6. Payment Method + Busiest Days ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
            {adv?.payment_methods?.length > 0 && (
              <div className="border border-zinc-200 bg-white p-4 md:p-5">
                <div className="kpi-label mb-4">Payment Method Breakdown</div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={adv.payment_methods} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                        tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                      <YAxis type="category" dataKey="method" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} width={68} />
                      <Tooltip formatter={v => [INR(v), "Amount"]} contentStyle={{ borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 11 }} />
                      <Bar dataKey="total" fill="#6366F1" radius={[0,2,2,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {adv?.busiest_days && (
              <div className="border border-zinc-200 bg-white p-4 md:p-5">
                <div className="kpi-label mb-4">Busiest Days of Week</div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={adv.busiest_days} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                        tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                      <Tooltip formatter={(v, n) => [n === "amount" ? INR(v) : v, n === "amount" ? "Revenue" : "Txns"]}
                        contentStyle={{ borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 11 }} />
                      <Bar dataKey="amount" fill="#F59E0B" radius={[2,2,0,0]} name="amount" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* ── 7. Top Repair Issues ── */}
          {adv?.top_issues?.length > 0 && (
            <div className="border border-zinc-200 bg-white p-4 md:p-5 mb-6">
              <div className="kpi-label mb-4">Top Repair Issues</div>
              <div style={{ height: Math.min(adv.top_issues.length * 36 + 20, 280) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adv.top_issues} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="issue" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} width={130} />
                    <Tooltip formatter={v => [v, "Devices"]} contentStyle={{ borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 11 }} />
                    <Bar dataKey="count" fill="#8B5CF6" radius={[0,2,2,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── 8. Category list ── */}
          {data.by_category?.length > 0 && (
            <SectionBox title="Category Detail">
              <ul className="divide-y divide-zinc-200">
                {[...data.by_category].sort((a,b) => (b.credit+b.debit)-(a.credit+a.debit)).map(c => (
                  <li key={c.category} className="px-4 md:px-5 py-3 flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium">{c.category}</span>
                    <div className="text-right flex-shrink-0">
                      {c.credit > 0 && <div className="text-xs font-mono text-green-700">+{INR(c.credit)} <span className="text-zinc-400 font-normal">in</span></div>}
                      {c.debit > 0 && <div className="text-xs font-mono text-red-600">-{INR(c.debit)} <span className="text-zinc-400 font-normal">out</span></div>}
                    </div>
                  </li>
                ))}
              </ul>
            </SectionBox>
          )}

          {/* ── 9. Outstanding ── */}
          {adv?.outstanding && (adv.outstanding.to_receive.length > 0 || adv.outstanding.to_pay.length > 0) && (
            <div className="mb-6">
              <div className="kpi-label mb-3">Outstanding Balances</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {adv.outstanding.to_receive.length > 0 && (
                  <div className="border border-green-200">
                    <div className="px-4 py-2.5 border-b border-green-200 bg-green-50 flex items-center justify-between">
                      <span className="kpi-label text-green-800">To Receive</span>
                      <span className="font-mono text-sm font-bold text-green-700">{INR(adv.outstanding.total_receive)}</span>
                    </div>
                    <ul className="divide-y divide-green-100 max-h-52 overflow-y-auto bg-white">
                      {adv.outstanding.to_receive.map(c => (
                        <li key={c.name} className="px-4 py-2.5 flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{c.name}</div>
                            {c.phone && <div className="text-[11px] text-zinc-500">{c.phone}</div>}
                          </div>
                          <span className="font-mono text-sm font-bold text-green-700 ml-3 flex-shrink-0">+{INR(c.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {adv.outstanding.to_pay.length > 0 && (
                  <div className="border border-red-200">
                    <div className="px-4 py-2.5 border-b border-red-200 bg-red-50 flex items-center justify-between">
                      <span className="kpi-label text-red-800">To Pay</span>
                      <span className="font-mono text-sm font-bold text-red-700">{INR(adv.outstanding.total_pay)}</span>
                    </div>
                    <ul className="divide-y divide-red-100 max-h-52 overflow-y-auto bg-white">
                      {adv.outstanding.to_pay.map(c => (
                        <li key={c.name} className="px-4 py-2.5 flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{c.name}</div>
                            {c.phone && <div className="text-[11px] text-zinc-500">{c.phone}</div>}
                          </div>
                          <span className="font-mono text-sm font-bold text-red-600 ml-3 flex-shrink-0">-{INR(c.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 10. Goal Tracking ── */}
          <div className="border border-zinc-200 bg-white mb-6">
            <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
              <div className="kpi-label flex items-center gap-2"><Target className="w-3.5 h-3.5 text-zinc-500" />Monthly Revenue Goal</div>
              <button type="button" onClick={() => { setGoalInput(goal > 0 ? String(goal) : ""); setEditingGoal(e => !e); }}
                className="text-xs text-zinc-500 hover:text-zinc-950 underline print:hidden">
                {editingGoal ? "Cancel" : goal > 0 ? "Edit Goal" : "Set Goal"}
              </button>
            </div>
            <div className="p-4 md:p-5">
              {editingGoal ? (
                <div className="flex gap-2 mb-4">
                  <Input type="number" min="0" value={goalInput} onChange={e => setGoalInput(e.target.value)}
                    placeholder="Enter monthly revenue goal (₹)" className="h-9 rounded-sm border-zinc-300 font-mono flex-1" autoFocus />
                  <Button type="button" className="h-9 rounded-sm bg-zinc-950 px-4 text-xs"
                    onClick={() => { const v = Number(goalInput); setGoal(v); localStorage.setItem("kc_monthly_goal", String(v)); setEditingGoal(false); }}>
                    Save
                  </Button>
                </div>
              ) : null}
              {goal > 0 ? (() => {
                const thisMonthCredit = data?.total_credit || 0;
                const pct = Math.min(100, Math.round((thisMonthCredit / goal) * 100));
                const remaining = Math.max(0, goal - thisMonthCredit);
                return (
                  <div>
                    <div className="flex items-end justify-between mb-2">
                      <div>
                        <div className="font-heading text-2xl font-bold text-zinc-950 tabular-nums">{INR(thisMonthCredit)}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">of {INR(goal)} goal · {remaining > 0 ? `${INR(remaining)} to go` : "Goal reached! 🎉"}</div>
                      </div>
                      <div className={`text-2xl font-bold tabular-nums ${pct >= 100 ? "text-green-700" : pct >= 75 ? "text-blue-700" : pct >= 50 ? "text-amber-700" : "text-red-600"}`}>
                        {pct}%
                      </div>
                    </div>
                    <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-green-600" : pct >= 75 ? "bg-blue-600" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })() : (
                <div className="text-sm text-zinc-400 text-center py-3">No goal set. Click "Set Goal" to track your monthly target.</div>
              )}
            </div>
          </div>

          {/* ── 11. Activity Heatmaps (4×) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
            <div className="border border-zinc-200 bg-white p-4 md:p-5">
              <div className="kpi-label mb-3">Daily Revenue — Last 90 Days</div>
              <CalendarHeatmap data={adv?.cash_flow_calendar || []} valueKey="amount" scheme="blue" />
            </div>
            <div className="border border-zinc-200 bg-white p-4 md:p-5">
              <div className="kpi-label mb-3">Daily Outstanding — Last 90 Days</div>
              <CalendarHeatmap data={adv?.daily_outstanding_calendar || []} valueKey="amount" scheme="blue" />
            </div>
            <div className="border border-zinc-200 bg-white p-4 md:p-5">
              <div className="kpi-label mb-3">Daily Inward Devices — Last 90 Days</div>
              <CalendarHeatmap data={adv?.daily_inward_calendar || []} valueKey="count" scheme="green" />
            </div>
            <div className="border border-zinc-200 bg-white p-4 md:p-5">
              <div className="kpi-label mb-3">Daily Outward Devices — Last 90 Days</div>
              <CalendarHeatmap data={adv?.daily_outward_calendar || []} valueKey="count" scheme="green" />
            </div>
          </div>

          {/* ── 12. Top Customers + Brand Popularity ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
            {adv?.top_customers?.filter(c => c.amount > 0).length > 0 && (
              <SectionBox title="Top 10 Customers by Revenue">
                <ul className="divide-y divide-zinc-200">
                  {adv.top_customers.filter(c => c.amount > 0).map((c, i) => (
                    <li key={c.name} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-xs font-bold text-zinc-400 w-5 text-right flex-shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        {c.phone && <div className="text-[11px] text-zinc-500">{c.phone}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono text-sm font-bold text-green-700">{INR(c.amount)}</div>
                        <div className="text-[10px] text-zinc-400">{c.transactions} txn{c.transactions !== 1 ? "s" : ""}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </SectionBox>
            )}

            {adv?.brand_popularity?.length > 0 && (
              <div className="border border-zinc-200 bg-white">
                <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
                  <div className="kpi-label flex items-center gap-2"><Laptop className="w-3.5 h-3.5 text-zinc-500" />Brand Popularity (All Time)</div>
                </div>
                <div className="p-4">
                  <div style={{ height: Math.min(adv.brand_popularity.length * 36 + 20, 260) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adv.brand_popularity} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="brand" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} width={60} />
                        <Tooltip formatter={v => [v, "Devices"]} contentStyle={{ borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 11 }} />
                        <Bar dataKey="count" fill="#14B8A6" radius={[0,2,2,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 13. Repeat Customers ── */}
          {adv?.repeat_customers && (
            <div className="border border-zinc-200 bg-white mb-6">
              <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
                <div className="kpi-label flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5 text-zinc-500" />Repeat Customers</div>
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span><strong className="text-zinc-950">{adv.repeat_customers.repeat_count}</strong> repeat</span>
                  <span><strong className="text-zinc-950">{adv.repeat_customers.total_unique}</strong> total unique</span>
                  {adv.repeat_customers.total_unique > 0 && (
                    <span className="font-semibold text-blue-700">
                      {Math.round((adv.repeat_customers.repeat_count / adv.repeat_customers.total_unique) * 100)}% loyalty rate
                    </span>
                  )}
                </div>
              </div>
              {adv.repeat_customers.top_repeat.length > 0 ? (
                <ul className="divide-y divide-zinc-200">
                  {adv.repeat_customers.top_repeat.map(c => (
                    <li key={c.name + c.phone} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-blue-700">{c.visits}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        {c.phone && <div className="text-[11px] text-zinc-500">{c.phone}</div>}
                      </div>
                      <div className="text-xs text-zinc-400">{c.visits} visit{c.visits !== 1 ? "s" : ""}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-6 text-sm text-zinc-400 text-center">No repeat customers yet.</div>
              )}
            </div>
          )}

          {/* ── 14. Pending Delivery Alert ── */}
          {adv?.pending_delivery?.length > 0 && (
            <div className="border border-amber-200 bg-amber-50/30 mb-6">
              <div className="px-4 md:px-5 py-3 border-b border-amber-200 bg-amber-50 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <div className="kpi-label text-amber-800">Pending Delivery ({adv.pending_delivery.length} device{adv.pending_delivery.length !== 1 ? "s" : ""})</div>
                <span className="text-xs text-amber-600 ml-1">— repair complete, not yet picked up</span>
              </div>
              <ul className="divide-y divide-amber-100 bg-white">
                {adv.pending_delivery.map(d => (
                  <li key={d.device_id || d.job_number}
                    onClick={() => navigate(`/devices/${d.device_id}`)}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-amber-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded-sm">{d.job_number || "—"}</span>
                        <span className="text-sm font-medium truncate">{d.brand} {d.model}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{d.customer_name}{d.customer_phone ? ` · ${d.customer_phone}` : ""}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-sm ${d.days_waiting >= 7 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {d.days_waiting}d waiting
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── 15. 6-Month Revenue Trend ── */}
          {adv?.monthly_trend?.length > 1 && (
            <div className="border border-zinc-200 bg-white p-4 md:p-6 mb-6 animate-fade-up">
              <div className="kpi-label mb-4">6-Month Revenue Trend</div>
              <div className="h-56 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={adv.monthly_trend} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                      tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                    <Tooltip formatter={(v, name) => [INR(v), name === "credit" ? "Income" : "Expense"]}
                      contentStyle={{ borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={n => n === "credit" ? "Income" : "Expense"} />
                    <Line type="monotone" dataKey="credit" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 4, fill: "#16A34A" }} name="credit" />
                    <Line type="monotone" dataKey="debit" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 4, fill: "#DC2626" }} name="debit" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Print footer */}
          <div className="hidden print:block text-center text-xs text-zinc-400 mt-8 pt-4 border-t border-zinc-200">
            Krish Computer Life Services · Reports · {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
          </div>
        </>
      )}
    </div>
  );
}
