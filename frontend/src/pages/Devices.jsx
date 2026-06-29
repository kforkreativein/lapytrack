import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Laptop, Monitor, Phone, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

function formatShortDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" }); }
  catch { return iso; }
}

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [monthlyStats, setMonthlyStats] = useState({ monthly_inward: 0, monthly_outward: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (status !== "all") params.status = status;
    if (category !== "all") params.category = category;
    const [deviceRes, statsRes] = await Promise.all([
      api.get("/devices", { params }),
      api.get("/stats"),
    ]);
    setDevices(deviceRes.data);
    setMonthlyStats({
      monthly_inward: statsRes.data.monthly_inward || 0,
      monthly_outward: statsRes.data.monthly_outward || 0,
    });
    setLoading(false);
  }, [category, q, status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mobile-page" data-testid="devices-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5 md:mb-6 animate-fade-up">
        <div>
          <div className="kpi-label">Inventory</div>
          <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">Devices</h1>
          <p className="text-sm text-zinc-500 mt-1">{devices.length} total records</p>
        </div>
        <Link to="/inward" className="w-full md:w-auto">
          <Button data-testid="add-device-button" className="w-full md:w-auto rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Inward
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 md:gap-3 mb-4">
        <div className="border border-zinc-200 bg-white p-3 md:p-4">
          <div className="kpi-label flex items-center gap-2">
            <ArrowDownToLine className="w-3 h-3 text-blue-600" />
            Inward This Month
          </div>
          <div className="font-heading text-2xl md:text-3xl font-bold mt-2 tabular-nums">
            {monthlyStats.monthly_inward}
          </div>
        </div>
        <div className="border border-zinc-200 bg-white p-3 md:p-4">
          <div className="kpi-label flex items-center gap-2">
            <ArrowUpFromLine className="w-3 h-3 text-zinc-600" />
            Outward This Month
          </div>
          <div className="font-heading text-2xl md:text-3xl font-bold mt-2 tabular-nums">
            {monthlyStats.monthly_outward}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-4 border border-zinc-200 p-3 bg-zinc-50/50">
        <div className="relative flex-1 min-w-0 md:min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            data-testid="device-search-input"
            placeholder="Search job no, serial, customer, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="pl-9 rounded-sm border-zinc-300 h-10 bg-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="status-filter" className="flex-1 md:w-[150px] rounded-sm border-zinc-300 h-10 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="in_repair">In Repair</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="category-filter" className="flex-1 md:w-[150px] rounded-sm border-zinc-300 h-10 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="repair">Repair</SelectItem>
              <SelectItem value="stock">Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-sm text-zinc-500">Loading…</div>
      ) : devices.length === 0 ? (
        <div className="border border-zinc-200 p-8 md:p-12 text-center bg-white">
          <img
            src="https://images.pexels.com/photos/31869847/pexels-photo-31869847.jpeg"
            alt=""
            className="w-32 h-32 object-cover mx-auto opacity-30 rounded-sm"
          />
          <h3 className="font-heading text-lg font-semibold mt-4">No devices yet</h3>
          <p className="text-sm text-zinc-500 mt-1">Log your first inward to get started.</p>
          <Link to="/inward" className="inline-block mt-4">
            <Button className="rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">New Inward</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-3" data-testid="devices-cards-mobile">
            {devices.map((d) => (
              <Link
                key={d.device_id}
                to={`/devices/${d.device_id}`}
                data-testid={`device-card-${d.device_id}`}
                className="block border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors p-3 touch-target"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded-sm">
                        {d.job_number || d.serial_number}
                      </span>
                      <StatusBadge status={d.status} expectedReturnDate={d.expected_return_date} />
                    </div>
                    <div className="font-semibold text-sm mt-1.5 break-words">
                      {d.brand} {d.model}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5 min-w-0">
                      {d.device_type === "Laptop" ? <Laptop className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                      <span className="font-mono truncate">{d.serial_number}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <div>{formatShortDate(d.inward_date || d.created_at)}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{d.customer_name || "—"}</div>
                    {d.customer_phone && (
                      <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5" />{d.customer_phone}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-zinc-950 flex-shrink-0">View →</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block border border-zinc-200 bg-white overflow-x-auto">
            <table className="w-full text-sm" data-testid="devices-table">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-[0.15em] text-zinc-500 sticky top-0">
                <tr className="border-b border-zinc-200">
                  <th className="text-left px-4 py-3 font-semibold">Job No.</th>
                  <th className="text-left px-4 py-3 font-semibold">Device</th>
                  <th className="text-left px-4 py-3 font-semibold">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold">Inward</th>
                  <th className="text-left px-4 py-3 font-semibold">Outward</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.device_id} className="border-b border-zinc-200 hover:bg-zinc-50 transition-colors duration-150"
                      data-testid={`device-row-${d.device_id}`}>
                    <td className="px-4 py-3 font-mono text-xs font-bold">{d.job_number || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {d.device_type === "Laptop"
                          ? <Laptop className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                          : <Monitor className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{d.brand} {d.model}</div>
                          <div className="text-[11px] text-zinc-500 font-mono">{d.serial_number}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-xs">{d.customer_name || "—"}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">{d.customer_phone || ""}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-600 font-mono whitespace-nowrap">{formatShortDate(d.inward_date || d.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600 font-mono whitespace-nowrap">{formatShortDate(d.outward_date)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} expectedReturnDate={d.expected_return_date} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/devices/${d.device_id}`} className="text-xs font-semibold text-zinc-950 hover:underline"
                            data-testid={`view-device-${d.device_id}`}>
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
