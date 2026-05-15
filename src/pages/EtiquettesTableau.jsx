import React, { useState, useMemo, useRef } from "react";
import {
  Lightbulb,
  Plug,
  Utensils,
  Flame,
  Droplet,
  Wind,
  Blinds,
  Car,
  Zap,
  Printer,
  Trash2,
  Plus,
  Save,
  FolderOpen,
  X,
  Search,
  Pencil,
  Copy,
  Wand2,
} from "lucide-react";
import EtiquettesPhotoModal from "../components/EtiquettesPhotoModal";

/* =========================================================================
   CONFIGURATION MÉTIER
   ========================================================================= */

// Dimensions physiques (mm) des étiquettes par marque/système
const BRANDS = {
  universel: { label: "Universel", width: 55, height: 18 },
  legrand: { label: "Legrand DRIVIA / RX³", width: 50, height: 10 },
  schneider: { label: "Schneider Resi9", width: 45, height: 8 },
  hager: { label: "Hager Gamma / Volta", width: 45, height: 8 },
};

// Catégories de circuits avec icône Lucide et couleur d'accent
const CATEGORIES = {
  eclairage: { label: "Éclairage", icon: Lightbulb, color: "#F59E0B" },
  prises: { label: "Prises", icon: Plug, color: "#3B82F6" },
  cuisine: { label: "Cuisine", icon: Utensils, color: "#F97316" },
  chauffage: { label: "Chauffage", icon: Flame, color: "#EF4444" },
  ecs: { label: "ECS", icon: Droplet, color: "#06B6D4" },
  vmc: { label: "VMC", icon: Wind, color: "#10B981" },
  volets: { label: "Volets / Portail", icon: Blinds, color: "#8B5CF6" },
  irve: { label: "IRVE", icon: Car, color: "#22C55E" },
  autre: { label: "Autre", icon: Zap, color: "#6B7280" },
};

// Bibliothèque de circuits préenregistrés (NF C 15-100)
const PRESET_CIRCUITS = [
  // Éclairage
  { category: "eclairage", label: "Éclairage Cuisine", breaker: 10 },
  { category: "eclairage", label: "Éclairage Salon", breaker: 10 },
  { category: "eclairage", label: "Éclairage Chambres", breaker: 10 },
  { category: "eclairage", label: "Éclairage SdB", breaker: 10 },
  { category: "eclairage", label: "Éclairage WC", breaker: 10 },
  { category: "eclairage", label: "Éclairage Couloir", breaker: 10 },
  { category: "eclairage", label: "Éclairage Entrée", breaker: 10 },
  { category: "eclairage", label: "Éclairage Extérieur", breaker: 10 },
  { category: "eclairage", label: "Éclairage Garage", breaker: 10 },
  // Prises
  { category: "prises", label: "Prises Cuisine", breaker: 20 },
  { category: "prises", label: "Prises Salon", breaker: 16 },
  { category: "prises", label: "Prises Chambres", breaker: 16 },
  { category: "prises", label: "Prises SdB", breaker: 16 },
  { category: "prises", label: "Prises Bureau", breaker: 16 },
  { category: "prises", label: "Prises Garage", breaker: 16 },
  // Cuisine spécialisée
  { category: "cuisine", label: "Lave-vaisselle", breaker: 20 },
  { category: "cuisine", label: "Four", breaker: 20 },
  { category: "cuisine", label: "Plaque cuisson", breaker: 32 },
  { category: "cuisine", label: "Hotte", breaker: 16 },
  { category: "cuisine", label: "Réfrigérateur", breaker: 16 },
  { category: "cuisine", label: "Micro-ondes", breaker: 16 },
  { category: "cuisine", label: "Lave-linge", breaker: 20 },
  { category: "cuisine", label: "Sèche-linge", breaker: 20 },
  // Chauffage
  { category: "chauffage", label: "Chauffage Salon", breaker: 20 },
  { category: "chauffage", label: "Chauffage Chambres", breaker: 20 },
  { category: "chauffage", label: "Chauffage SdB", breaker: 20 },
  { category: "chauffage", label: "PAC", breaker: 32 },
  { category: "chauffage", label: "Plancher chauffant", breaker: 32 },
  // ECS
  { category: "ecs", label: "Chauffe-eau", breaker: 20 },
  { category: "ecs", label: "Ballon ECS", breaker: 20 },
  // VMC
  { category: "vmc", label: "VMC", breaker: 2 },
  // Volets / Portail
  { category: "volets", label: "Volets roulants", breaker: 10 },
  { category: "volets", label: "Portail", breaker: 10 },
  // IRVE
  { category: "irve", label: "Borne IRVE 7 kW", breaker: 32 },
  { category: "irve", label: "Borne IRVE 22 kW", breaker: 40 },
];

const BREAKER_VALUES = [2, 10, 16, 20, 32, 40, 63];

/* =========================================================================
   COMPOSANT PRINCIPAL
   ========================================================================= */

export default function EtiquettesTableau() {
  const [brand, setBrand] = useState("universel");
  const [circuits, setCircuits] = useState([]);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [clientName, setClientName] = useState("");
  const [photoImportOpen, setPhotoImportOpen] = useState(false);
  const fileInputRef = useRef(null);

  const dims = BRANDS[brand];

  // Bibliothèque filtrée par recherche
  const filteredPresets = useMemo(() => {
    if (!search.trim()) return PRESET_CIRCUITS;
    const q = search.toLowerCase();
    return PRESET_CIRCUITS.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        CATEGORIES[p.category].label.toLowerCase().includes(q)
    );
  }, [search]);

  // Groupé par catégorie pour l'affichage
  const presetsByCategory = useMemo(() => {
    return filteredPresets.reduce((acc, p) => {
      (acc[p.category] = acc[p.category] || []).push(p);
      return acc;
    }, {});
  }, [filteredPresets]);

  /* ----- Actions sur les circuits ----- */
  function addFromPreset(preset) {
    setCircuits((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: preset.label,
        category: preset.category,
        breaker: preset.breaker,
      },
    ]);
  }

  function addCustom() {
    const newCircuit = {
      id: crypto.randomUUID(),
      label: "Nouveau circuit",
      category: "autre",
      breaker: 16,
    };
    setCircuits((prev) => [...prev, newCircuit]);
    setEditing(newCircuit);
  }

  function updateCircuit(id, updates) {
    setCircuits((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
    if (editing?.id === id) setEditing({ ...editing, ...updates });
  }

  function deleteCircuit(id) {
    setCircuits((prev) => prev.filter((c) => c.id !== id));
    if (editing?.id === id) setEditing(null);
  }

  function duplicateCircuit(id) {
    setCircuits((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], id: crypto.randomUUID() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  function clearAll() {
    if (circuits.length === 0) return;
    if (confirm("Supprimer toutes les étiquettes ?")) setCircuits([]);
  }

  function addManyFromImport(items) {
    setCircuits((prev) => [
      ...prev,
      ...items.map((c) => ({
        id: crypto.randomUUID(),
        label: c.label,
        category: c.category,
        breaker: c.breaker,
        modules: c.modules ?? 1,
      })),
    ]);
  }

  /* ----- Sauvegarde / chargement (JSON, en attendant Supabase) ----- */
  function saveToFile() {
    const data = {
      client: clientName,
      brand,
      circuits,
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etiquettes-${(clientName || "tableau").replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadFromFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.brand) setBrand(data.brand);
        if (data.client) setClientName(data.client);
        if (Array.isArray(data.circuits)) setCircuits(data.circuits);
      } catch {
        alert("Fichier illisible");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handlePrint() {
    window.print();
  }

  /* ----- Rendu ----- */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Style d'impression dédié */}
      <style>{printStyles(dims)}</style>

      {/* Header — masqué à l'impression */}
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500 text-white">
              <Zap size={22} />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                Étiquettes Tableau
              </h1>
              <p className="text-xs text-slate-500">
                Red Den Connexion — Module Artisan Facile
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Nom du client / chantier"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {Object.entries(BRANDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.width}×{v.height} mm)
                </option>
              ))}
            </select>

            <button
              onClick={() => setPhotoImportOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
              title="Importer depuis une photo du tableau (IA)"
            >
              <Wand2 size={16} /> Photo IA
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Charger un projet"
            >
              <FolderOpen size={16} /> Charger
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={loadFromFile}
            />

            <button
              onClick={saveToFile}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Sauvegarder en JSON"
            >
              <Save size={16} /> Sauver
            </button>

            <button
              onClick={handlePrint}
              disabled={circuits.length === 0}
              className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={16} /> Imprimer / PDF
            </button>
          </div>
        </div>
      </header>

      {/* Layout principal */}
      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-6 lg:grid-cols-[320px_1fr]">
        {/* ---- Bibliothèque (masquée à l'impression) ---- */}
        <aside className="no-print rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-3">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Rechercher un circuit…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-300 py-1.5 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <button
              onClick={addCustom}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600 hover:border-amber-500 hover:bg-amber-50 hover:text-amber-700"
            >
              <Plus size={16} /> Circuit personnalisé
            </button>
          </div>

          <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-3">
            {Object.entries(presetsByCategory).length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-slate-500">
                Aucun résultat
              </p>
            )}
            {Object.entries(presetsByCategory).map(([catKey, presets]) => {
              const cat = CATEGORIES[catKey];
              const Icon = cat.icon;
              return (
                <div key={catKey} className="mb-3 last:mb-0">
                  <div className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Icon size={14} style={{ color: cat.color }} />
                    {cat.label}
                  </div>
                  <div className="space-y-1">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => addFromPreset(p)}
                        className="group flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-slate-200 hover:bg-slate-50"
                      >
                        <span className="truncate">{p.label}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 group-hover:bg-white">
                          {p.breaker}A
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ---- Aperçu des étiquettes ---- */}
        <section>
          {/* Barre d'info / actions */}
          <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">
                {circuits.length}
              </span>{" "}
              étiquette{circuits.length > 1 ? "s" : ""} —{" "}
              <span className="text-slate-500">
                format {dims.width}×{dims.height} mm
              </span>
            </p>
            {circuits.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={14} /> Tout effacer
              </button>
            )}
          </div>

          {/* Zone d'impression */}
          <div className="print-area rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            {/* En-tête imprimé */}
            <div className="print-header mb-4 hidden border-b border-slate-300 pb-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>
                  <strong>Red Den Connexion</strong> — Étiquettes tableau
                  électrique
                </span>
                <span>{clientName || "—"}</span>
              </div>
            </div>

            {circuits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-amber-50">
                  <Zap size={26} className="text-amber-500" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  Aucune étiquette pour le moment
                </p>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Pioche dans la bibliothèque à gauche, ou crée un circuit
                  personnalisé.
                </p>
              </div>
            ) : (
              <div className="labels-grid">
                {circuits.map((c) => (
                  <LabelCard
                    key={c.id}
                    circuit={c}
                    dims={dims}
                    onEdit={() => setEditing(c)}
                    onDelete={() => deleteCircuit(c.id)}
                    onDuplicate={() => duplicateCircuit(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Modal d'édition */}
      {editing && (
        <EditModal
          circuit={editing}
          onChange={(updates) => updateCircuit(editing.id, updates)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Modal d'import IA depuis photo */}
      {photoImportOpen && (
        <EtiquettesPhotoModal
          onClose={() => setPhotoImportOpen(false)}
          onImport={addManyFromImport}
        />
      )}
    </div>
  );
}

/* =========================================================================
   COMPOSANT ÉTIQUETTE
   ========================================================================= */

function LabelCard({ circuit, dims, onEdit, onDelete, onDuplicate }) {
  const cat = CATEGORIES[circuit.category] || CATEGORIES.autre;
  const Icon = cat.icon;

  // Échelle d'affichage à l'écran (1 mm ≈ 3.78 px ; ici on grossit ×2 pour la lisibilité)
  const SCALE = 2.4;
  const wPx = dims.width * SCALE;
  const hPx = Math.max(dims.height * SCALE, 50); // hauteur écran min pour lisibilité

  return (
    <div className="label-wrapper group relative">
      <div
        className="label"
        style={{
          width: `${dims.width}mm`,
          height: `${dims.height}mm`,
          // À l'écran, on affiche en pixels plus grands ; à l'impression, en mm exacts
          ["--label-w-screen"]: `${wPx}px`,
          ["--label-h-screen"]: `${hPx}px`,
          ["--accent"]: cat.color,
        }}
      >
        <div className="label-accent" />
        <div className="label-content">
          <Icon className="label-icon" />
          <div className="label-text">
            <div className="label-title">{circuit.label}</div>
            <div className="label-sub">{circuit.breaker} A</div>
          </div>
        </div>
      </div>

      {/* Boutons d'action (masqués à l'impression) */}
      <div className="no-print pointer-events-none absolute -top-2 -right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full bg-white text-slate-600 shadow-md ring-1 ring-slate-200 hover:text-amber-600"
          title="Modifier"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDuplicate}
          className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full bg-white text-slate-600 shadow-md ring-1 ring-slate-200 hover:text-blue-600"
          title="Dupliquer"
        >
          <Copy size={13} />
        </button>
        <button
          onClick={onDelete}
          className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full bg-white text-slate-600 shadow-md ring-1 ring-slate-200 hover:text-rose-600"
          title="Supprimer"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   MODALE D'ÉDITION
   ========================================================================= */

function EditModal({ circuit, onChange, onClose }) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Modifier l'étiquette</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Libellé">
            <input
              type="text"
              value={circuit.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              autoFocus
            />
          </Field>

          <Field label="Catégorie">
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(CATEGORIES).map(([k, c]) => {
                const Icon = c.icon;
                const active = circuit.category === k;
                return (
                  <button
                    key={k}
                    onClick={() => onChange({ category: k })}
                    className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs ${
                      active
                        ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={16} style={{ color: c.color }} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Calibre disjoncteur">
            <div className="flex flex-wrap gap-1.5">
              {BREAKER_VALUES.map((a) => (
                <button
                  key={a}
                  onClick={() => onChange({ breaker: a })}
                  className={`rounded-md border px-3 py-1 text-sm font-medium ${
                    circuit.breaker === a
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {a}A
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
          >
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}

/* =========================================================================
   FEUILLE DE STYLE (écran + impression)
   ========================================================================= */

function printStyles(dims) {
  return `
    .labels-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 4mm;
    }
    .label {
      width: var(--label-w-screen);
      height: var(--label-h-screen);
      position: relative;
      display: flex;
      background: white;
      border: 1px dashed #cbd5e1;
      border-radius: 2px;
      overflow: hidden;
      box-sizing: border-box;
    }
    .label-accent {
      width: 4px;
      background: var(--accent, #6B7280);
      flex-shrink: 0;
    }
    .label-content {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      flex: 1;
      min-width: 0;
    }
    .label-icon {
      width: 14px;
      height: 14px;
      color: var(--accent, #6B7280);
      flex-shrink: 0;
    }
    .label-text {
      min-width: 0;
      flex: 1;
      line-height: 1.15;
    }
    .label-title {
      font-size: 10px;
      font-weight: 600;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .label-sub {
      font-size: 8px;
      color: #64748b;
      margin-top: 1px;
    }

    @media print {
      @page {
        size: A4;
        margin: 10mm;
      }
      body { background: white !important; }
      .no-print { display: none !important; }
      .print-header { display: block !important; }
      .print-area {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      .label {
        width: ${dims.width}mm !important;
        height: ${dims.height}mm !important;
        border: 1px dashed #94a3b8 !important;
        page-break-inside: avoid;
      }
      .label-icon { width: 10px; height: 10px; }
      .label-title { font-size: ${dims.height > 12 ? 9 : 7}px; }
      .label-sub { font-size: ${dims.height > 12 ? 7 : 6}px; }
    }
  `;
}
