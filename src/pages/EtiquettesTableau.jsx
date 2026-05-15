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
  GripVertical,
  LayoutGrid,
  Rows3,
  Wand2,
} from "lucide-react";
import EtiquettesPhotoModal from "../components/EtiquettesPhotoModal";

/* =========================================================================
   CONFIGURATION MÉTIER
   ========================================================================= */

// Dimensions physiques (mm) par marque.
// modulePitch = largeur d'1 module DIN (l'étiquette s'élargit × le nombre de modules
// occupés par le disjoncteur : 1P, 2P, 3P, 4P).
// height = hauteur de l'étiquette imprimée. rowSize = nombre de modules par rangée
// (utilisé pour le mode "rangées" qui visualise comme dans le vrai tableau).
const BRANDS = {
  universel:  { label: "Universel",            modulePitch: 18,   height: 18, rowSize: 13 },
  legrand:    { label: "Legrand DRIVIA / RX³", modulePitch: 17.5, height: 10, rowSize: 13 },
  schneider:  { label: "Schneider Resi9",      modulePitch: 18,   height: 8,  rowSize: 13 },
  hager:      { label: "Hager Gamma / Volta",  modulePitch: 17.5, height: 8,  rowSize: 12 },
};

// Nombre de modules occupés par type de protection
const MODULE_OPTIONS = [
  { value: 1, label: "1P (1 module)" },
  { value: 2, label: "2P (2 modules)" },
  { value: 3, label: "3P (3 modules)" },
  { value: 4, label: "4P / Tétra (4 modules)" },
];

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
  // IRVE — bipolaire monophasé / tétrapolaire triphasé
  { category: "irve", label: "Borne IRVE 7 kW", breaker: 32, modules: 2 },
  { category: "irve", label: "Borne IRVE 22 kW", breaker: 40, modules: 4 },
  // PAC — généralement bipolaire
  { category: "chauffage", label: "PAC bi-bloc", breaker: 32, modules: 2 },
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
  const [viewMode, setViewMode] = useState("plate"); // 'plate' | 'rows'
  const [dragId, setDragId] = useState(null);
  const [photoImportOpen, setPhotoImportOpen] = useState(false);
  const [photoImportInitial, setPhotoImportInitial] = useState(null);
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
        modules: preset.modules ?? 1,
      },
    ]);
  }

  function addCustom() {
    const newCircuit = {
      id: crypto.randomUUID(),
      label: "Nouveau circuit",
      category: "autre",
      breaker: 16,
      modules: 1,
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
    e.target.value = "";
    if (!file) return;

    // L'utilisateur a sélectionné une image plutôt qu'une sauvegarde JSON
    // (cas fréquent sur mobile où l'attribut `accept` n'est pas respecté) :
    // on bascule directement sur le flux d'import IA pour ne pas le bloquer.
    if (file.type.startsWith("image/")) {
      setPhotoImportInitial(file);
      setPhotoImportOpen(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.brand) setBrand(data.brand);
        if (data.client) setClientName(data.client);
        if (Array.isArray(data.circuits)) {
          // Anciens fichiers (avant V2) : pas de champ `modules`, on défaut à 1
          setCircuits(data.circuits.map((c) => ({ modules: 1, ...c })));
        }
      } catch {
        alert(
          "Ce bouton attend une sauvegarde au format .json.\n\n" +
            "Pour importer une photo de tableau, utilisez le bouton « Photo IA »."
        );
      }
    };
    reader.readAsText(file);
  }

  function handlePrint() {
    window.print();
  }

  /* ----- Drag & drop pour réordonner ----- */
  function onDragStart(id) {
    setDragId(id);
  }
  function onDragEnd() {
    setDragId(null);
  }
  function onDropOn(targetId) {
    if (!dragId || dragId === targetId) return;
    setCircuits((prev) => {
      const from = prev.findIndex((c) => c.id === dragId);
      const to = prev.findIndex((c) => c.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /* ----- Vue "Rangées" : on regroupe les circuits ligne par ligne en respectant
     la capacité du tableau (rowSize modules par rangée). Un circuit qui ne tient
     pas dans la rangée en cours bascule sur la suivante. ----- */
  const rows = useMemo(() => {
    const rowSize = dims.rowSize;
    const result = [];
    let current = { items: [], used: 0 };
    for (const c of circuits) {
      const m = Math.min(c.modules || 1, rowSize);
      if (current.used + m > rowSize) {
        result.push(current);
        current = { items: [], used: 0 };
      }
      current.items.push({ circuit: c, slot: current.used + 1 });
      current.used += m;
    }
    if (current.items.length > 0) result.push(current);
    return result;
  }, [circuits, dims.rowSize]);

  /* ----- Rendu ----- */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Style d'impression dédié */}
      <style>{printStyles(dims)}</style>

      {/* Header — masqué à l'impression */}
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500 text-white">
              <Zap size={22} />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                Étiquettes Tableau
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
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
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              {Object.entries(BRANDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.modulePitch}×{v.height} mm/mod.)
                </option>
              ))}
            </select>

            <button
              onClick={() => setPhotoImportOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
              title="Importer depuis une photo du tableau (IA)"
            >
              <Wand2 size={16} /> Photo IA
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
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
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
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
        <aside className="no-print rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
          <div className="border-b border-slate-200 p-3 dark:border-slate-700">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
              <input
                type="text"
                placeholder="Rechercher un circuit…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <button
              onClick={addCustom}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600 hover:border-amber-500 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-amber-500 dark:hover:bg-amber-900/30 dark:hover:text-amber-300"
            >
              <Plus size={16} /> Circuit personnalisé
            </button>
          </div>

          <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-3">
            {Object.entries(presetsByCategory).length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucun résultat
              </p>
            )}
            {Object.entries(presetsByCategory).map(([catKey, presets]) => {
              const cat = CATEGORIES[catKey];
              const Icon = cat.icon;
              return (
                <div key={catKey} className="mb-3 last:mb-0">
                  <div className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <Icon size={14} style={{ color: cat.color }} />
                    {cat.label}
                  </div>
                  <div className="space-y-1">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => addFromPreset(p)}
                        className="group flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-700"
                      >
                        <span className="truncate">{p.label}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 group-hover:bg-white dark:bg-slate-700 dark:text-slate-300 dark:group-hover:bg-slate-600">
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
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">
                {circuits.length}
              </span>{" "}
              étiquette{circuits.length > 1 ? "s" : ""} —{" "}
              <span className="text-slate-500 dark:text-slate-400">
                module {dims.modulePitch} mm × {dims.height} mm
              </span>
            </p>
            <div className="flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800">
                <button
                  onClick={() => setViewMode("plate")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${
                    viewMode === "plate"
                      ? "bg-amber-500 text-white"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                  title="Vue planche : étiquettes en grille libre"
                >
                  <LayoutGrid size={13} /> Planche
                </button>
                <button
                  onClick={() => setViewMode("rows")}
                  className={`flex items-center gap-1.5 border-l border-slate-300 px-2.5 py-1 text-xs font-medium dark:border-slate-600 ${
                    viewMode === "rows"
                      ? "bg-amber-500 text-white"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                  title={`Vue rangées : comme dans le vrai tableau (${dims.rowSize} modules / rangée)`}
                >
                  <Rows3 size={13} /> Rangées
                </button>
              </div>
              {circuits.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950"
                >
                  <Trash2 size={14} /> Tout effacer
                </button>
              )}
            </div>
          </div>

          {/* Zone d'impression */}
          <div className="print-area rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none print:bg-white">
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
                <div className="grid h-14 w-14 place-items-center rounded-full bg-amber-50 dark:bg-amber-900/30">
                  <Zap size={26} className="text-amber-500" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Aucune étiquette pour le moment
                </p>
                <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                  Pioche dans la bibliothèque à gauche, ou crée un circuit
                  personnalisé.
                </p>
              </div>
            ) : viewMode === "plate" ? (
              <div className="labels-grid">
                {circuits.map((c) => (
                  <LabelCard
                    key={c.id}
                    circuit={c}
                    dims={dims}
                    isDragging={dragId === c.id}
                    onEdit={() => setEditing(c)}
                    onDelete={() => deleteCircuit(c.id)}
                    onDuplicate={() => duplicateCircuit(c.id)}
                    onDragStart={() => onDragStart(c.id)}
                    onDragEnd={onDragEnd}
                    onDropOn={() => onDropOn(c.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((row, idx) => (
                  <RowView
                    key={idx}
                    rowIndex={idx + 1}
                    items={row.items}
                    used={row.used}
                    dims={dims}
                    dragId={dragId}
                    onEdit={(c) => setEditing(c)}
                    onDelete={(id) => deleteCircuit(id)}
                    onDuplicate={(id) => duplicateCircuit(id)}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDropOn={onDropOn}
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
          initialFile={photoImportInitial}
          onClose={() => {
            setPhotoImportOpen(false);
            setPhotoImportInitial(null);
          }}
          onImport={addManyFromImport}
        />
      )}
    </div>
  );
}

/* =========================================================================
   COMPOSANT ÉTIQUETTE
   ========================================================================= */

function LabelCard({
  circuit,
  dims,
  isDragging,
  onEdit,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragEnd,
  onDropOn,
}) {
  const cat = CATEGORIES[circuit.category] || CATEGORIES.autre;
  const Icon = cat.icon;

  // Largeur réelle = largeur d'1 module × nombre de modules occupés
  const modules = circuit.modules || 1;
  const widthMm = dims.modulePitch * modules;

  // Échelle d'affichage à l'écran (1 mm ≈ 3.78 px ; on grossit pour la lisibilité)
  const SCALE = 3.6;
  const wPx = widthMm * SCALE;
  const hPx = Math.max(dims.height * SCALE, 56);

  return (
    <div
      className={`label-wrapper group relative ${isDragging ? "opacity-40" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn?.();
      }}
    >
      <div
        className="label"
        style={{
          // À l'écran : pixels plus grands. À l'impression : mm exacts.
          // Les deux sont passés par variables CSS, le @media print bascule.
          ["--label-w-screen"]: `${wPx}px`,
          ["--label-h-screen"]: `${hPx}px`,
          ["--label-w-print"]: `${widthMm}mm`,
          ["--label-h-print"]: `${dims.height}mm`,
          ["--accent"]: cat.color,
        }}
      >
        <div className="label-accent" />
        <div className="label-content">
          <Icon className="label-icon" />
          <div className="label-text">
            <div className="label-title">{circuit.label}</div>
            <div className="label-sub">
              {circuit.breaker} A{modules > 1 ? ` · ${modules}P` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Poignée de drag — visible au hover, masquée à l'impression */}
      <div
        className="no-print pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
        title="Glisser pour réordonner"
      >
        <div className="grid h-7 w-5 cursor-grab place-items-center rounded-full bg-white text-slate-400 shadow-md ring-1 ring-slate-200 active:cursor-grabbing">
          <GripVertical size={13} />
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
   VUE "RANGÉES" — visualise comme dans le vrai tableau
   ========================================================================= */

function RowView({
  rowIndex,
  items,
  used,
  dims,
  dragId,
  onEdit,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragEnd,
  onDropOn,
}) {
  const empty = Math.max(dims.rowSize - used, 0);
  return (
    <div className="row-view">
      <div className="no-print mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-200">Rangée {rowIndex}</span>
        <span className="text-slate-400 dark:text-slate-500">
          {used}/{dims.rowSize} modules
        </span>
      </div>
      <div className="flex items-stretch gap-px rounded-md border border-slate-300 bg-slate-100 p-1 dark:border-slate-600 dark:bg-slate-900">
        {items.map(({ circuit, slot }) => (
          <div key={circuit.id} className="flex flex-col items-center gap-1">
            <span className="no-print text-[10px] font-medium text-slate-400 dark:text-slate-500">
              {rowIndex}.{slot}
            </span>
            <LabelCard
              circuit={circuit}
              dims={dims}
              isDragging={dragId === circuit.id}
              onEdit={() => onEdit(circuit)}
              onDelete={() => onDelete(circuit.id)}
              onDuplicate={() => onDuplicate(circuit.id)}
              onDragStart={() => onDragStart(circuit.id)}
              onDragEnd={onDragEnd}
              onDropOn={() => onDropOn(circuit.id)}
            />
          </div>
        ))}
        {empty > 0 && (
          <div
            className="no-print flex items-center justify-center self-stretch rounded border border-dashed border-slate-300 bg-white text-[10px] text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500"
            style={{ width: `${dims.modulePitch * empty * 3.6}px` }}
          >
            {empty} module{empty > 1 ? "s" : ""} libre{empty > 1 ? "s" : ""}
          </div>
        )}
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
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold dark:text-slate-100">Modifier l'étiquette</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
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
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
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
                        ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
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
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  }`}
                >
                  {a}A
                </button>
              ))}
            </div>
          </Field>

          <Field label="Type / nombre de modules">
            <div className="grid grid-cols-2 gap-1.5">
              {MODULE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange({ modules: opt.value })}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                    (circuit.modules || 1) === opt.value
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  }`}
                >
                  {opt.label}
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
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
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
        width: var(--label-w-print) !important;
        height: var(--label-h-print) !important;
        border: 1px dashed #94a3b8 !important;
        page-break-inside: avoid;
      }
      .label-icon { width: 10px; height: 10px; }
      .label-title { font-size: ${dims.height > 12 ? 9 : 7}px; }
      .label-sub { font-size: ${dims.height > 12 ? 7 : 6}px; }
      .row-view { page-break-inside: avoid; }
    }
  `;
}
