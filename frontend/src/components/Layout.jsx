import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard, Boxes, BookOpen, BarChart2,
  Settings, Lock, Menu, Tag,
} from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/devices",   label: "Devices",   icon: Boxes },
  { to: "/ledger",    label: "Ledger",    icon: BookOpen },
  { to: "/reports",   label: "Reports",   icon: BarChart2 },
  { to: "/catalog",   label: "Customize", icon: Tag },
  { to: "/settings",  label: "Settings",  icon: Settings },
];

// Bottom nav: primary 5 (skip Customize to keep tabs clean on mobile)
const BOTTOM_NAV = NAV.filter(n => n.to !== "/catalog");

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/lapytrack-logo.svg" alt="" className="w-8 h-8 rounded-sm flex-shrink-0" />
      <div className="min-w-0">
        <div className="font-heading font-bold text-[13px] tracking-tight text-zinc-950 leading-tight">KRISH COMPUTER</div>
        <div className="text-[9px] tracking-[0.15em] uppercase font-semibold text-zinc-500 leading-tight">LIFE SERVICES</div>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate, lockNow }) {
  const location = useLocation();
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 py-5 border-b border-zinc-200">
        <Logo />
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.to === "/dashboard"
            ? location.pathname === "/dashboard"
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={() =>
                `flex items-center gap-3 px-3 py-2.5 text-sm rounded-sm transition-colors duration-150 ${
                  isActive ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-100"
                }`
              }
            >
              <Icon className="w-4 h-4" strokeWidth={2} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-zinc-200">
        <button
          onClick={lockNow}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
        >
          <Lock className="w-4 h-4" strokeWidth={2} />
          <span className="font-medium">Lock App</span>
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { lockNow } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const segments = location.pathname.split("/").filter(Boolean);
  const currentLabel = NAV.find(n => location.pathname.startsWith(n.to))?.label
    || segments[0]?.toUpperCase() || "DASHBOARD";

  return (
    <div className="min-h-dvh flex bg-white overflow-x-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 border-r border-zinc-200 flex-shrink-0 flex-col">
        <SidebarContent lockNow={lockNow} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-64 sm:max-w-64 border-r border-zinc-200">
          <SidebarContent lockNow={() => { lockNow(); setOpen(false); }} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header — mobile only (hamburger + title) */}
        <header className="md:hidden h-14 border-b border-zinc-200 flex items-center justify-between px-3 bg-white sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 -ml-2 touch-target">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
            </Sheet>
            <Logo />
          </div>
          <button onClick={lockNow} className="h-10 w-10 flex items-center justify-center rounded-sm hover:bg-zinc-100 flex-shrink-0 touch-target">
            <Lock className="w-4 h-4 text-zinc-600" />
          </button>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-zinc-200 flex safe-area-bottom">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.to === "/dashboard"
              ? location.pathname === "/dashboard"
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 text-[9px] uppercase tracking-wider font-semibold transition-colors touch-target ${
                  isActive ? "text-zinc-950 bg-zinc-50" : "text-zinc-400"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
                <span className="max-w-full truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
