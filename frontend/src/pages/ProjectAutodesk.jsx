import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Building2, FolderOpen, Link2, Unlink, RefreshCw, ArrowLeft, CheckCircle2, FileText, UploadCloud, Copy, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { buildBriefPdf } from "@/lib/brief";

export default function ProjectAutodesk() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState(null);
  const [hubs, setHubs] = useState([]);
  const [hubId, setHubId] = useState(null);
  const [apsProjects, setApsProjects] = useState([]);
  const [contents, setContents] = useState([]);
  const [lastSynced, setLastSynced] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState(null);

  const load = async () => {
    const [p, s] = await Promise.all([api.get(`/projects/${id}`), api.get("/autodesk/status")]);
    setProject(p.data);
    setStatus(s.data);
    setLastSynced(p.data.autodesk?.last_synced_at || null);
    return { project: p.data, status: s.data };
  };

  useEffect(() => {
    load().then(({ project: p, status: s }) => {
      if (s.connected && !p.autodesk) loadHubs();
      if (s.connected && p.autodesk) sync();
    });
  }, [id]);

  const loadHubs = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/autodesk/hubs");
      setHubs(data);
      if (data[0]) selectHub(data[0].id);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to load hubs"); }
    finally { setBusy(false); }
  };

  const selectHub = async (hid) => {
    setHubId(hid); setApsProjects([]); setBusy(true);
    try {
      const { data } = await api.get(`/autodesk/hubs/${encodeURIComponent(hid)}/projects`);
      setApsProjects(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to load Autodesk projects"); }
    finally { setBusy(false); }
  };

  const link = async (p) => {
    const hub = hubs.find((h) => h.id === hubId);
    setBusy(true);
    try {
      await api.put(`/projects/${id}/autodesk-link`, {
        hub_id: hubId, hub_name: hub?.name, aps_project_id: p.id,
        aps_project_name: p.name, root_folder: p.root_folder,
      });
      toast.success(`Linked to ${p.name}`);
      await load();
      sync();
    } catch (e) { toast.error(e?.response?.data?.detail || "Linking failed"); }
    finally { setBusy(false); }
  };

  const unlink = async () => {
    await api.delete(`/projects/${id}/autodesk-link`);
    setContents([]); setLastSynced(null);
    toast.success("Autodesk project unlinked");
    await load();
    loadHubs();
  };

  const sync = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/projects/${id}/autodesk-contents`);
      setContents(data.items);
      setLastSynced(data.last_synced_at);
      toast.success(`Pulled ${data.items.length} item(s) from Autodesk`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Sync failed"); }
    finally { setBusy(false); }
  };

  const pushToAutodesk = async () => {
    setPushing(true); setPushResults(null);
    try {
      const blob = buildBriefPdf(project).output("blob");
      const fd = new FormData();
      fd.append("brief", new File([blob], "design_brief.pdf", { type: "application/pdf" }));
      fd.append("include_boundary", "true");
      fd.append("include_zoning", "true");
      const { data } = await api.post(`/projects/${id}/autodesk-push`, fd);
      setPushResults(data.results);
      toast.success(`Pushed ${data.results.filter((r) => r.ok).length} file(s) to Autodesk`);
      sync();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Push to Autodesk failed");
    } finally { setPushing(false); }
  };

  if (!project || !status) {
    return <div className="p-8 text-slate-500 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>;
  }

  const linked = project.autodesk;

  return (
    <div data-testid="project-autodesk-page" className="p-6 lg:p-10 max-w-6xl">
      <Link to={`/projects/${id}/map`} className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 mb-4">
        <ArrowLeft size={12} /> Back to map
      </Link>
      <div className="overline mb-2">Autodesk Sync</div>
      <h1 className="font-display font-extrabold text-3xl text-slate-900">{project.name}</h1>
      <p className="text-sm text-slate-500 mt-2 max-w-2xl">
        Link this plan to a real Autodesk hub project. SmartScape pulls the linked project's folders and design
        files on demand — your planning data stays local.
      </p>

      {!status.connected ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6">
          <div className="font-semibold text-amber-900">Autodesk account not connected</div>
          <p className="text-sm text-amber-800 mt-1">Connect your Autodesk account once, then come back to link a project.</p>
          <div className="mt-4 rounded-md bg-white/70 border border-amber-200 p-3">
            <div className="text-[11px] uppercase tracking-widest text-amber-900 font-semibold mb-1.5">
              <AlertTriangle size={12} className="inline mr-1" /> Before connecting, register this callback URL in your APS app
            </div>
            <div className="flex items-center gap-2">
              <code data-testid="callback-url" className="text-[11px] break-all text-slate-700 flex-1">{status.callback_url}</code>
              <button data-testid="copy-callback-btn"
                onClick={() => { navigator.clipboard?.writeText(status.callback_url); toast.success("Callback URL copied"); }}
                className="h-8 px-2 rounded border border-amber-300 text-amber-900 text-xs hover:bg-amber-100 flex items-center gap-1">
                <Copy size={12} /> Copy
              </button>
            </div>
            <div className="text-[11px] text-amber-800 mt-2">
              aps.autodesk.com → My Apps → your app → Callback URL. Without it Autodesk shows a “request error” after sign-in.
            </div>
          </div>
          <Link data-testid="goto-integrations" to="/integrations"
            className="inline-flex mt-4 h-10 px-5 items-center gap-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800">
            <Link2 size={14} /> Connect Autodesk
          </Link>
        </div>
      ) : linked ? (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-8 rounded-lg border border-slate-200 bg-white p-6 flex items-start gap-4">
            <div className="w-11 h-11 rounded-md bg-emerald-600 grid place-items-center text-white"><CheckCircle2 size={20} /></div>
            <div className="flex-1 min-w-0">
              <div data-testid="linked-project-name" className="font-semibold text-slate-900">{linked.aps_project_name}</div>
              <div className="text-sm text-slate-500">{linked.hub_name} · linked {new Date(linked.linked_at).toLocaleString()}</div>
              <div data-testid="last-synced" className="text-xs text-slate-500 mt-1">
                Last synced: {lastSynced ? new Date(lastSynced).toLocaleString() : "never"}
              </div>
            </div>
            <div className="flex gap-2">
              <button data-testid="autodesk-sync-btn" onClick={sync} disabled={busy}
                className="h-10 px-4 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync now
              </button>
              <button data-testid="autodesk-unlink-btn" onClick={unlink}
                className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 flex items-center gap-2">
                <Unlink size={14} /> Unlink
              </button>
            </div>
          </motion.div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-md bg-slate-100 grid place-items-center text-slate-700"><UploadCloud size={20} /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900">Push SmartScape outputs to Autodesk</div>
                <div className="text-sm text-slate-500 mt-1">
                  Uploads the Design Brief PDF{project.boundary ? ", the site boundary GeoJSON" : ""} and the zoning GeoJSON
                  into <span className="font-medium text-slate-700">{linked.aps_project_name}</span>. Re-pushing creates a new version.
                </div>
                {linked.last_pushed_at && (
                  <div data-testid="last-pushed" className="text-xs text-slate-500 mt-1">
                    Last pushed: {new Date(linked.last_pushed_at).toLocaleString()}
                  </div>
                )}
              </div>
              <button data-testid="autodesk-push-btn" onClick={pushToAutodesk} disabled={pushing}
                className="h-10 px-5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2">
                {pushing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                {pushing ? "Uploading…" : "Push to Autodesk"}
              </button>
            </div>
            {pushResults && (
              <div data-testid="push-results" className="mt-4 border-t border-slate-200 pt-3 space-y-1.5">
                {pushResults.map((r) => (
                  <div key={r.name} className="flex items-center gap-2 text-sm">
                    {r.ok ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-red-500" />}
                    <span className="text-slate-900 font-medium">{r.name}</span>
                    <span className="text-xs text-slate-500">
                      {r.ok ? `${r.mode === "new_version" ? "new version" : "created"} · ${r.size_kb} KB` : r.error}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileText size={15} /> Linked project contents
            </div>
            <div data-testid="linked-contents-list">
              {contents.length === 0 && <div className="p-4 text-sm text-slate-500">No items pulled yet — hit “Sync now”.</div>}
              {contents.map((c) => (
                <div key={c.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.type}{c.extension ? ` · ${c.extension.split(":").slice(-1)[0]}` : ""}
                    </div>
                  </div>
                  {c.updated_at && <div className="text-xs text-slate-400">{new Date(c.updated_at).toLocaleDateString()}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Building2 size={15} /> Hubs {busy && <Loader2 size={13} className="animate-spin text-slate-400" />}
            </div>
            <div data-testid="link-hubs-list" className="max-h-80 overflow-y-auto">
              {hubs.length === 0 && <div className="p-4 text-sm text-slate-500">No hubs available.</div>}
              {hubs.map((h) => (
                <button key={h.id} onClick={() => selectHub(h.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 ${hubId === h.id ? "bg-emerald-50/60" : ""}`}>
                  <div className="text-sm font-medium text-slate-900 truncate">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.type || h.region}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FolderOpen size={15} /> Pick a project to link
            </div>
            <div data-testid="link-projects-list" className="max-h-80 overflow-y-auto">
              {apsProjects.length === 0 && <div className="p-4 text-sm text-slate-500">Select a hub to list projects.</div>}
              {apsProjects.map((p) => (
                <div key={p.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 truncate">{p.type}</div>
                  </div>
                  <button data-testid={`link-btn-${p.id}`} onClick={() => link(p)} disabled={busy}
                    className="h-8 px-3 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5">
                    <Link2 size={12} /> Link
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
