import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Link2, Unlink, RefreshCw, Building2, FolderOpen, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

export default function Integrations() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [hubs, setHubs] = useState([]);
  const [hubId, setHubId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [contents, setContents] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = () =>
    api.get("/autodesk/status").then((r) => setStatus(r.data)).finally(() => setLoading(false));

  useEffect(() => {
    loadStatus();
    const flag = params.get("autodesk");
    if (flag === "connected") toast.success("Autodesk account connected");
    if (flag === "error") toast.error(`Autodesk connection failed: ${params.get("reason") || "unknown error"}`);
    if (flag) { params.delete("autodesk"); params.delete("reason"); setParams(params, { replace: true }); }
  }, []);

  useEffect(() => { if (status?.connected) loadHubs(); }, [status?.connected]);

  const connect = async () => {
    setConnecting(true);
    try {
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      const { data } = await api.post("/autodesk/connect-url", { return_url: window.location.origin + "/integrations" });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start Autodesk sign-in");
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await api.post("/autodesk/disconnect");
    setHubs([]); setProjects([]); setContents([]); setHubId(null); setActiveProject(null);
    toast.success("Autodesk account disconnected");
    loadStatus();
  };

  const loadHubs = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/autodesk/hubs");
      setHubs(data);
      if (data[0]) selectHub(data[0].id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load Autodesk hubs");
    } finally { setBusy(false); }
  };

  const selectHub = async (id) => {
    setHubId(id); setProjects([]); setContents([]); setActiveProject(null); setBusy(true);
    try {
      const { data } = await api.get(`/autodesk/hubs/${encodeURIComponent(id)}/projects`);
      setProjects(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load projects");
    } finally { setBusy(false); }
  };

  const openProject = async (p) => {
    setActiveProject(p); setContents([]);
    if (!p.root_folder) return;
    setBusy(true);
    try {
      const { data } = await api.get(`/autodesk/projects/${encodeURIComponent(p.id)}/contents?folder_id=${encodeURIComponent(p.root_folder)}`);
      setContents(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load project contents");
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="p-10 text-slate-500 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading integrations…</div>;
  }

  return (
    <div data-testid="integrations-page" className="p-8 max-w-6xl">
      <div className="overline mb-2">Integrations</div>
      <h1 className="font-display font-extrabold text-3xl text-slate-900">Autodesk Platform Services</h1>
      <p className="text-sm text-slate-500 mt-2 max-w-2xl">
        Sign in with your Autodesk account to read your Forma / ACC hubs and projects. SmartScape keeps its
        planning engine local — Autodesk is used for real account, hub and project data.
      </p>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-md bg-slate-900 grid place-items-center text-white font-display font-bold">A</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-slate-900">Autodesk Forma / ACC</div>
              {status?.connected ? (
                <span data-testid="autodesk-connected-badge" className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  <CheckCircle2 size={12} /> Connected
                </span>
              ) : (
                <span data-testid="autodesk-disconnected-badge" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Not connected</span>
              )}
            </div>
            {status?.connected ? (
              <div className="text-sm text-slate-500 mt-1">
                {status.profile?.name || status.profile?.email || "Autodesk account"} · scopes: {status.scope}
              </div>
            ) : (
              <div className="text-sm text-slate-500 mt-1">3-legged OAuth via APS. Callback: <code className="text-xs">{status?.callback_url}</code></div>
            )}
          </div>
          <div className="flex gap-2">
            {status?.connected ? (
              <>
                <button data-testid="autodesk-refresh-btn" onClick={loadHubs}
                  className="h-10 px-4 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
                  <RefreshCw size={14} /> Refresh
                </button>
                <button data-testid="autodesk-disconnect-btn" onClick={disconnect}
                  className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 flex items-center gap-2">
                  <Unlink size={14} /> Disconnect
                </button>
              </>
            ) : (
              <button data-testid="autodesk-connect-btn" disabled={connecting || !status?.configured} onClick={connect}
                className="h-10 px-5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2">
                {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Connect Autodesk
              </button>
            )}
          </div>
        </div>
        {!status?.configured && (
          <div className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-2">
            <AlertTriangle size={16} className="mt-0.5" /> Autodesk client credentials are missing on the server.
          </div>
        )}
      </motion.div>

      {status?.connected && (
        <div className="mt-8 grid lg:grid-cols-3 gap-6">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Building2 size={15} /> Hubs {busy && <Loader2 size={13} className="animate-spin text-slate-400" />}
            </div>
            <div data-testid="autodesk-hubs-list" className="max-h-80 overflow-y-auto">
              {hubs.length === 0 && <div className="p-4 text-sm text-slate-500">No hubs found for this account.</div>}
              {hubs.map((h) => (
                <button key={h.id} data-testid={`autodesk-hub-${h.id}`} onClick={() => selectHub(h.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 ${hubId === h.id ? "bg-emerald-50/60" : ""}`}>
                  <div className="text-sm font-medium text-slate-900 truncate">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.type || h.region}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FolderOpen size={15} /> Projects
            </div>
            <div data-testid="autodesk-projects-list" className="max-h-80 overflow-y-auto">
              {projects.length === 0 && <div className="p-4 text-sm text-slate-500">Select a hub to list projects.</div>}
              {projects.map((p) => (
                <button key={p.id} data-testid={`autodesk-project-${p.id}`} onClick={() => openProject(p)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex items-center gap-2 ${activeProject?.id === p.id ? "bg-emerald-50/60" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 truncate">{p.type}</div>
                  </div>
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">
              Contents {activeProject ? `— ${activeProject.name}` : ""}
            </div>
            <div data-testid="autodesk-contents-list" className="max-h-80 overflow-y-auto">
              {contents.length === 0 && <div className="p-4 text-sm text-slate-500">Open a project to browse its top-level folders and design files (Forma proposals appear here when shared to ACC).</div>}
              {contents.map((c) => (
                <div key={c.id} className="px-4 py-3 border-b border-slate-100 last:border-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.type}{c.extension ? ` · ${c.extension.split(":").slice(-1)[0]}` : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
