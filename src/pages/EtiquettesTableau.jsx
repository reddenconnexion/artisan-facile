import React, { useState, useMemo, useRef, useLayoutEffect, useEffect } from "react";
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
  Copy,
  Scissors,
  Wand2,
  ShieldCheck,
  ToggleRight,
  Power,
  Clock,
} from "lucide-react";
import EtiquettesPhotoModal from "../components/EtiquettesPhotoModal";

/* =========================================================================
   CONFIGURATION MÉTIER
   ========================================================================= */

// Dimensions physiques (mm) par marque.
// modulePitch = largeur d'1 module DIN (l'étiquette s'élargit × le nombre de modules
// occupés par le disjoncteur : 1P, 2P, 3P, 4P).
// height = hauteur de l'étiquette imprimée (format vertical : icône au-dessus,
// libellé sur 1-2 lignes en-dessous, comme sur les vraies étiquettes Resi9/DRIVIA).
// rowSize = nombre de modules par rangée (utilisé pour le mode "rangées").
const BRANDS = {
  universel:  { label: "Universel",            modulePitch: 18,   height: 30, rowSize: 13 },
  legrand:    { label: "Legrand DRIVIA / RX³", modulePitch: 17.5, height: 22, rowSize: 13 },
  schneider:  { label: "Schneider Resi9",      modulePitch: 18,   height: 25, rowSize: 13 },
  hager:      { label: "Hager Gamma / Volta",  modulePitch: 17.5, height: 20, rowSize: 12 },
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
  differentiel: { label: "Différentiel", icon: ShieldCheck, color: "#0EA5E9" },
  sectionneur: { label: "Inter. sectionneur", icon: Power, color: "#E11D48" },
  eclairage: { label: "Éclairage", icon: Lightbulb, color: "#F59E0B" },
  prises: { label: "Prises", icon: Plug, color: "#3B82F6" },
  cuisine: { label: "Cuisine", icon: Utensils, color: "#F97316" },
  chauffage: { label: "Chauffage", icon: Flame, color: "#EF4444" },
  ecs: { label: "ECS", icon: Droplet, color: "#06B6D4" },
  vmc: { label: "VMC", icon: Wind, color: "#10B981" },
  volets: { label: "Volets / Portail", icon: Blinds, color: "#8B5CF6" },
  irve: { label: "IRVE", icon: Car, color: "#22C55E" },
  contacteur: { label: "Contacteur", icon: ToggleRight, color: "#A855F7" },
  horloge: { label: "Horloge / Minuterie", icon: Clock, color: "#14B8A6" },
  autre: { label: "Autre", icon: Zap, color: "#6B7280" },
};

// Bibliothèque de circuits préenregistrés (NF C 15-100)
const PRESET_CIRCUITS = [
  // Interrupteurs différentiels (têtes de rangée) — bipolaires (2 modules)
  { category: "differentiel", label: "ID 40A Type AC 30mA", breaker: 40, modules: 2 },
  { category: "differentiel", label: "ID 63A Type AC 30mA", breaker: 63, modules: 2 },
  { category: "differentiel", label: "ID 40A Type A 30mA", breaker: 40, modules: 2 },
  { category: "differentiel", label: "ID 63A Type A 30mA", breaker: 63, modules: 2 },
  { category: "differentiel", label: "ID 40A Type F 30mA", breaker: 40, modules: 2 },
  { category: "differentiel", label: "ID 63A Type F 30mA", breaker: 63, modules: 2 },
  { category: "differentiel", label: "ID 25A Type AC 300mA", breaker: 25, modules: 2 },
  // Interrupteurs sectionneurs — mono (bipolaire 2P) / tri (tétrapolaire 4P)
  { category: "sectionneur", label: "Inter. sectionneur 63A mono", breaker: 63, modules: 2 },
  { category: "sectionneur", label: "Inter. sectionneur 40A mono", breaker: 40, modules: 2 },
  { category: "sectionneur", label: "Inter. sectionneur 63A tri", breaker: 63, modules: 4 },
  { category: "sectionneur", label: "Inter. sectionneur 40A tri", breaker: 40, modules: 4 },
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
  // Contacteurs (auxiliaires de puissance) — bipolaires
  { category: "contacteur", label: "Contacteur J/N HC", breaker: 25, modules: 2 },
  { category: "contacteur", label: "Contacteur 25A 2P", breaker: 25, modules: 2 },
  { category: "contacteur", label: "Contacteur 40A 2P", breaker: 40, modules: 2 },
  { category: "contacteur", label: "Contacteur 63A 4P", breaker: 63, modules: 4 },
  // Horloges & minuteries — 1 ou 2 modules selon le modèle
  { category: "horloge", label: "Horloge programmable", breaker: 16, modules: 1 },
  { category: "horloge", label: "Horloge ECS heures creuses", breaker: 16, modules: 1 },
  { category: "horloge", label: "Horloge éclairage ext.", breaker: 16, modules: 1 },
  { category: "horloge", label: "Minuterie escalier", breaker: 10, modules: 1 },
  { category: "horloge", label: "Télérupteur", breaker: 10, modules: 1 },
];

const BREAKER_VALUES = [2, 10, 16, 20, 32, 40, 63];

/* =========================================================================
   COMPOSANT PRINCIPAL
   ========================================================================= */

// Clé localStorage pour la sauvegarde automatique du projet en cours.
// Restauré au mount, ré-enregistré à chaque changement.
const STORAGE_KEY = "etiquettes_tableau_autosave_v1";

function loadAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

export default function EtiquettesTableau() {
  // Restauration de l'autosave au tout premier rendu (lazy init).
  const initial = useMemo(() => loadAutosave() || {}, []);
  const [brand, setBrand] = useState(initial.brand || "universel");
  const [circuits, setCircuits] = useState(
    Array.isArray(initial.circuits) ? initial.circuits.map((c) => ({ modules: 1, ...c })) : []
  );
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [clientName, setClientName] = useState(initial.clientName || "");
  const [dragId, setDragId] = useState(null);
  const [photoImportOpen, setPhotoImportOpen] = useState(false);
  const [photoImportInitial, setPhotoImportInitial] = useState(null);
  // null = on suit le défaut de la marque ; sinon = override utilisateur
  const [customRowSize, setCustomRowSize] = useState(
    typeof initial.customRowSize === "number" ? initial.customRowSize : null
  );
  const fileInputRef = useRef(null);

  // Auto-sauvegarde : à chaque changement on persiste l'état en localStorage,
  // pour éviter de tout perdre sur un reload accidentel ou un crash navigateur.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ brand, circuits, clientName, customRowSize, savedAt: Date.now() })
      );
    } catch {
      // Quota dépassé ou navigation privée : on ignore silencieusement.
    }
  }, [brand, circuits, clientName, customRowSize]);

  const dims = BRANDS[brand];
  const effectiveRowSize = customRowSize ?? dims.rowSize;

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

  function toggleEndsRow(id) {
    setCircuits((prev) =>
      prev.map((c) => (c.id === id ? { ...c, endsRow: !c.endsRow } : c))
    );
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
    const rowSize = effectiveRowSize;
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
      // Marqueur "fin de rangée" : on bascule sur une nouvelle rangée
      // même si la courante n'est pas remplie (réserve de modules pour
      // extension future).
      if (c.endsRow && current.items.length > 0) {
        result.push(current);
        current = { items: [], used: 0 };
      }
    }
    if (current.items.length > 0) result.push(current);
    return result;
  }, [circuits, effectiveRowSize]);

  /* ----- Rendu ----- */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Style d'impression dédié */}
      <style>{printStyles()}</style>

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
              onChange={(e) => {
                setBrand(e.target.value);
                // Reset au défaut de la nouvelle marque (l'utilisateur peut
                // ensuite ré-overrider via l'input "modules/rangée").
                setCustomRowSize(null);
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              {Object.entries(BRANDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.modulePitch}×{v.height} mm/mod.)
                </option>
              ))}
            </select>

            <label
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
              title="Nombre de modules par rangée du tableau réel (8, 13, 18…). Affecte la vue Rangées."
            >
              <span className="whitespace-nowrap">Mod./rangée</span>
              <input
                type="number"
                min={4}
                max={36}
                step={1}
                value={effectiveRowSize}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setCustomRowSize(Number.isFinite(v) && v >= 4 && v <= 36 ? v : null);
                }}
                className="w-12 rounded border-0 bg-transparent p-0 text-center text-sm font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-0 dark:text-slate-100"
              />
            </label>

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
            {circuits.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950"
              >
                <Trash2 size={14} /> Tout effacer
              </button>
            )}
          </div>

          {/* Zone d'impression */}
          <div className="print-area rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none print:bg-white">
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
            ) : (
              <div className="space-y-3">
                {rows.map((row, idx) => (
                  <RowView
                    key={idx}
                    rowIndex={idx + 1}
                    items={row.items}
                    used={row.used}
                    rowSize={effectiveRowSize}
                    dims={dims}
                    dragId={dragId}
                    onEdit={(c) => setEditing(c)}
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
          onDelete={() => deleteCircuit(editing.id)}
          onDuplicate={() => duplicateCircuit(editing.id)}
          onToggleEndsRow={() => toggleEndsRow(editing.id)}
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

  // Espace disponible pour FitText (en px écran). On retire :
  // - 3px : bandeau d'accent
  // - 6px : padding vertical du contenu
  // - icône (≈ 18% de la hauteur, floor 12px)
  // - sub label (12px)
  // - 6px : gaps internes
  const iconPx = Math.max(12, Math.round(hPx * 0.18));
  const titleMaxWidth = Math.max(wPx - 6, 20);
  const titleMaxHeight = Math.max(hPx - 3 - 6 - iconPx - 12 - 6, 12);
  const titleMaxFont = Math.max(10, Math.min(36, hPx * 0.45));

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
        className="label cursor-pointer"
        onClick={onEdit}
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
          <Icon className="label-icon" style={{ width: iconPx, height: iconPx }} />
          <FitText
            text={circuit.label}
            className="label-title"
            maxWidth={titleMaxWidth}
            maxHeight={titleMaxHeight}
            maxPx={titleMaxFont}
            minPx={5}
          />
          <div className="label-sub">
            {circuit.breaker} A{modules > 1 ? ` · ${modules}P` : ""}
          </div>
        </div>
        {/* Indicateur "fin de rangée" : petite icône ciseaux en bas-droite
            quand le flag endsRow est actif (le toggle se fait depuis le
            modal d'édition). */}
        {circuit.endsRow && (
          <div className="no-print absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-amber-500 text-white shadow-sm">
            <Scissors size={9} />
          </div>
        )}
      </div>

      {/* Toutes les actions (modifier, dupliquer, fin de rangée, supprimer)
          sont accessibles depuis le modal d'édition : on l'ouvre par un
          clic sur l'étiquette. Pas de boutons inline : ils chevauchaient
          les étiquettes voisines en vue Rangées. */}
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
  rowSize,
  dims,
  dragId,
  onEdit,
  onDragStart,
  onDragEnd,
  onDropOn,
}) {
  const empty = Math.max(rowSize - used, 0);
  return (
    <div className="row-view">
      <div className="no-print mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-200">Rangée {rowIndex}</span>
        <span className="text-slate-400 dark:text-slate-500">
          {used}/{rowSize} modules
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
            {empty} module{empty > 1 ? "s" : ""} libre{empty > 1 ? "s" : ""} (réserve)
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   MODALE D'ÉDITION
   ========================================================================= */

function EditModal({ circuit, onChange, onClose, onDelete, onDuplicate, onToggleEndsRow }) {
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

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { onDuplicate(); onClose(); }}
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              title="Dupliquer ce circuit"
            >
              <Copy size={13} /> Dupliquer
            </button>
            <button
              onClick={onToggleEndsRow}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                circuit.endsRow
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              }`}
              title="Forcer la fin de rangée après ce circuit (réserve)"
            >
              <Scissors size={13} /> {circuit.endsRow ? "Fin de rangée ✓" : "Fin de rangée"}
            </button>
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950"
              title="Supprimer ce circuit"
            >
              <Trash2 size={13} /> Supprimer
            </button>
          </div>
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

function printStyles() {
  return `
    .labels-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 3mm;
    }
    /* Layout vertical : bandeau de couleur en haut, icône centrée,
       libellé sur 1-2 lignes en bas (comme les vraies étiquettes Resi9/DRIVIA). */
    .label {
      width: var(--label-w-screen);
      height: var(--label-h-screen);
      position: relative;
      display: flex;
      flex-direction: column;
      background: white;
      border: 1px solid #cbd5e1;
      border-radius: 2px;
      overflow: hidden;
      box-sizing: border-box;
      /* Force le navigateur à imprimer les couleurs (bandeau, icône, etc.) */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-accent {
      height: 3px;
      width: 100%;
      background: var(--accent, #6B7280);
      flex-shrink: 0;
      /* Force le navigateur à imprimer le fond coloré même quand l'option
         "Graphiques d'arrière-plan" du dialogue d'impression est désactivée. */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      /* Picto en haut, libellé juste en dessous (cf. vraies étiquettes Resi9). */
      justify-content: flex-start;
      gap: 2px;
      padding: 3px 2px;
      flex: 1;
      min-height: 0;
      text-align: center;
    }
    /* width/height pilotés en inline par LabelCard (proportionnels à la hauteur de la marque). */
    .label-icon {
      color: var(--accent, #6B7280);
      flex-shrink: 0;
    }
    /* font-size piloté en inline par FitText. */
    .label-title {
      font-weight: 700;
      color: #0f172a;
    }
    .label-sub {
      font-size: 8px;
      color: #475569;
      margin-top: 1px;
      font-weight: 500;
    }

    @media print {
      /* A4 paysage par défaut : permet d'imprimer une rangée de 13 modules
         (≈ 234 mm) ou 18 modules (≈ 324 mm — au-delà du paysage, à splitter).
         Marge de 15 mm pour rester confortablement à l'intérieur de la
         zone imprimable de la plupart des imprimantes consumer (les zones
         non-imprimables vont jusqu'à 10-12 mm sur certaines machines). */
      @page {
        size: A4 landscape;
        margin: 15mm;
      }
      body { background: white !important; }
      .no-print { display: none !important; }

      /* Isolation totale du print-area : on masque tout le reste de l'app
         (sidebar du Layout, header, bibliothèque, modals…) sans le retirer
         du DOM (visibility, pas display:none, sinon les ancêtres se
         réorganisent et la mise en page mm est cassée). Puis on remonte
         le print-area en haut-gauche de la page imprimée. */
      body * { visibility: hidden !important; }
      .print-area, .print-area * { visibility: visible !important; }
      .print-area {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        right: 0 !important;
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      .label {
        width: var(--label-w-print) !important;
        height: var(--label-h-print) !important;
        border: 1px solid #94a3b8 !important;
        page-break-inside: avoid;
      }
      /* Strip contigu : on retire le fond gris, la bordure et le padding du
         conteneur de rangée pour que les étiquettes soient bord à bord,
         prêtes à découper d'un seul coup au cutter. */
      .row-view > div:nth-child(2) {
        gap: 0 !important;
        padding: 0 !important;
        border: none !important;
        background: transparent !important;
        border-radius: 0 !important;
      }
      .row-view + .row-view {
        margin-top: 8mm;
      }
      .row-view { page-break-inside: avoid; }
    }
  `;
}

/* =========================================================================
   COMPOSANT FIT-TEXT : auto-dimensionne le texte pour remplir l'espace
   disponible (largeur ET hauteur) sans déborder, par dichotomie.
   ========================================================================= */

function FitText({ text, maxWidth, maxHeight, maxPx = 30, minPx = 5, className }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !maxWidth || !maxHeight) return;

    // Dichotomie : la plus grande taille de police qui tient dans
    // maxWidth × maxHeight (le texte peut wrapper sur plusieurs lignes).
    let lo = minPx;
    let hi = maxPx;
    let best = minPx;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      const fits =
        el.scrollWidth <= maxWidth + 0.5 &&
        el.scrollHeight <= maxHeight + 0.5;
      if (fits) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
      if (hi - lo < 0.25) break;
    }
    el.style.fontSize = `${best}px`;
  });
  // ↑ deps volontairement omises : on relance le fit à CHAQUE render pour
  // résister aux re-renders parents (drag, hover…) sans state, sinon React
  // réappliquerait la fontSize de la prop style et le texte resterait à 5 px.

  return (
    <span
      ref={ref}
      className={className}
      style={{
        display: "block",
        width: `${maxWidth}px`,
        // PAS de fontSize ici (sinon React l'écrase sur chaque re-render).
        // Le useLayoutEffect ci-dessus la pose directement sur le node.
        // wordBreak/overflowWrap normaux : on ne coupe JAMAIS au milieu d'un
        // mot. Si un mot est trop long, le binary-search ci-dessus shrink
        // la police jusqu'à ce qu'il tienne. Hyphens="manual" pour ne pas
        // ajouter de césures automatiques imprévues.
        wordBreak: "normal",
        overflowWrap: "normal",
        lineHeight: 1.05,
        textAlign: "center",
        hyphens: "manual",
      }}
    >
      {text}
    </span>
  );
}
