import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, MapPinned, FolderKanban, PlusCircle, Building2,
  Leaf, ScrollText, GitCompareArrows, ShieldAlert, FileBarChart2,
  LogOut, Search, Bell, ChevronRight, Plug
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { NAV } from "@/constants/testIds";
import ChatBot from "@/components/ChatBot";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testId: NAV.sidebarDashboard, projectRoute: false },
  { to: "/projects/new", label: "New Planning Project", icon: PlusCircle, testId: NAV.sidebarNewProject, projectRoute: false },
  { to: "/projects", label: "Projects", icon: FolderKanban, testId: NAV.sidebarProjects, projectRoute: false },
  { to: "map", label: "Zoning Map", icon: MapPinned, testId: NAV.sidebarMap, projectRoute: true },
  { to: "infrastructure", label: "Infrastructure", icon: Building2, testId: NAV.sidebarInfra, projectRoute: true },
  { to: "sustainability", label: "Sustainability", icon: Leaf, testId: NAV.sidebarSustain, projectRoute: true },
  { to: "blueprint", label: "Smart City Blueprint", icon: ScrollText, testId: NAV.sidebarBlueprint, projectRoute: true },
  { to: "proposals", label: "Proposal Comparison", icon: GitCompareArrows, testId: NAV.sidebarProposals, projectRoute: true },
  { to: "risks", label: "Challenges & Risks", icon: ShieldAlert, testId: NAV.sidebarRisks, projectRoute: true },
  { to: "reports", label: "Reports", icon: FileBarChart2, testId: NAV.sidebarReports, projectRoute: true },
  { to: "/integrations", label: "Autodesk Integration", icon: Plug, testId: NAV.sidebarIntegrations, projectRoute: false },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const params = useParams();
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(params.id || null);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState([]);
  const [openSearch, setOpenSearch] = useState(false);

  useEffect(() => {
    api.get("/projects").then((r) => setProjects(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (params.id) setActiveProjectId(params.id);
    else if (!activeProjectId && projects[0]) setActiveProjectId(projects[0].id);
  }, [params.id, projects]);

  useEffect(() => {
    if (!searchQ.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(searchQ)}${activeProjectId ? `&project_id=${activeProjectId}` : ""}`)
        .then((r) => setResults(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ, activeProjectId]);

  const buildLink = (item) => {
    if (!item.projectRoute) return item.to;
    if (!activeProjectId) return "/projects";
    return `/projects/${activeProjectId}/${item.to}`;
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-200">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-slate-900 grid place-items-center">
              <div className="w-4 h-4 bg-emerald-500 rounded-sm rotate-45" />
            </div>
            <div>
              <div className="font-display font-extrabold text-slate-900 text-lg leading-none tracking-tight">SmartScape</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1">Urban Intelligence</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_ITEMS.map((it) => {
            const to = buildLink(it);
            const active = pathname === to || (it.projectRoute && pathname.endsWith(`/${it.to}`));
            const disabled = it.projectRoute && !activeProjectId;
            return (
              <Link
                key={it.label}
                to={disabled ? "/projects" : to}
                data-testid={it.testId}
                className={`group flex items-center gap-3 px-5 py-2.5 text-sm border-l-2 ${
                  active ? "border-emerald-500 bg-emerald-50/60 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
              >
                <it.icon size={16} className={active ? "text-emerald-600" : ""} />
                <span className="font-medium">{it.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          {activeProject && (
            <div className="mb-3 rounded-md border border-slate-200 p-3 bg-slate-50/60">
              <div className="overline mb-1">Active Project</div>
              <div className="text-sm font-semibold text-slate-900 line-clamp-1">{activeProject.name}</div>
              <div className="text-xs text-slate-500 line-clamp-1">{activeProject.location.name}</div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white grid place-items-center text-xs font-semibold">
              {user?.name?.[0] || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 truncate">{user?.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{user?.role}</div>
            </div>
            <button data-testid={NAV.logout} onClick={() => { logout(); nav("/"); }} className="p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-slate-200 bg-white/85 backdrop-blur-xl sticky top-0 z-30 flex items-center px-6 gap-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>SmartScape</span>
            <ChevronRight size={14} />
            <span className="text-slate-900 font-medium capitalize">
              {pathname.split("/").filter(Boolean).slice(-1)[0]?.replace(/-/g, " ") || "Dashboard"}
            </span>
          </div>

          <div className="flex-1 max-w-xl mx-auto relative">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                data-testid={NAV.globalSearch}
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); setOpenSearch(true); }}
                onFocus={() => setOpenSearch(true)}
                onBlur={() => setTimeout(() => setOpenSearch(false), 200)}
                placeholder="Search zones, schools, hospitals, parks, projects…"
                className="w-full pl-9 pr-3 h-9 rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm"
              />
            </div>
            <AnimatePresence>
              {openSearch && results.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  className="absolute top-11 left-0 right-0 bg-white border border-slate-200 rounded-md shadow-lg z-40 max-h-96 overflow-y-auto"
                >
                  {results.map((r, i) => (
                    <button
                      key={i}
                      data-testid={`search-result-${i}`}
                      onMouseDown={() => {
                        setOpenSearch(false); setSearchQ("");
                        if (r.type === "project") nav(`/projects/${r.id}/map`);
                        else if (r.type === "zone") nav(`/projects/${r.project_id}/map?zone=${r.id}`);
                        else if (r.type === "infra") nav(`/projects/${r.project_id}/infrastructure`);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center gap-3"
                    >
                      <div className="w-2 h-2 rounded-full" style={{ background: r.color || "#0F172A" }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900">{r.title}</div>
                        <div className="text-xs text-slate-500 truncate">{r.subtitle}</div>
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-400">{r.type}</div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button className="p-2 rounded-md hover:bg-slate-100 text-slate-600 relative">
            <Bell size={16} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </div>
      </main>

      <ChatBot projectId={activeProjectId} />
    </div>
  );
}
