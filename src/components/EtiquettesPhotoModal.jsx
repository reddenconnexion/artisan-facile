import React, { useState, useRef } from "react";
import { Upload, X, Wand2, Loader2, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { supabase } from "../utils/supabase";
import { imageFileToBase64 } from "../utils/mediaConverters";

const VALID_CATEGORIES = [
  "eclairage", "prises", "cuisine", "chauffage",
  "ecs", "vmc", "volets", "irve", "autre",
];

const SYSTEM_PROMPT =
  "Tu es un expert électricien français. Tu analyses des photos de tableaux " +
  "électriques avec étiquettes provisoires (manuscrites au crayon ou marqueur, " +
  "ou imprimées) pour extraire la liste des circuits, dans l'ordre des " +
  "disjoncteurs (gauche à droite, haut en bas).";

const USER_PROMPT = `Analyse cette photo de tableau électrique et extrait toutes les étiquettes de circuits visibles.

Pour chaque circuit, retourne un objet JSON avec :
- "label" (string) : libellé reformulé proprement en français (ex: "Éclairage Salon", "Prises Cuisine", "Lave-vaisselle"). Corrige les fautes et abréviations courantes.
- "breaker" (number) : calibre du disjoncteur en ampères (parmi 2, 10, 16, 20, 32, 40, 63). Si lisible sur le disjoncteur, utilise cette valeur. Sinon déduis : éclairage=10, prises classiques=16, prises cuisine/lave-linge=20, plaque/PAC/IRVE 7kW=32, IRVE 22kW=40.
- "modules" (number) : nombre de modules occupés (1=monobloc/1P, 2=bipolaire/2P, 4=tétrapolaire). Si tu vois un disjoncteur double-largeur, mets 2. Triphasé tétra = 4. Par défaut 1.
- "category" (string) : EXACTEMENT une de : eclairage, prises, cuisine, chauffage, ecs, vmc, volets, irve, autre.

Réponds UNIQUEMENT avec le tableau JSON brut, sans texte autour, sans bloc markdown.

Exemple de format attendu :
[{"label":"Éclairage Salon","breaker":10,"modules":1,"category":"eclairage"},{"label":"Plaque cuisson","breaker":32,"modules":1,"category":"cuisine"}]`;

// Extrait le tableau JSON même si le modèle a entouré la réponse de texte
// ou de fences markdown.
function parseCircuitsResponse(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Aucun tableau JSON trouvé dans la réponse.");
  }
  const json = text.slice(start, end + 1);
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error("Réponse inattendue (pas un tableau).");
  return arr
    .filter((c) => c && typeof c.label === "string" && c.label.trim())
    .map((c) => ({
      label: String(c.label).trim().slice(0, 80),
      breaker: Number.isFinite(c.breaker) ? Math.round(c.breaker) : 16,
      modules: [1, 2, 3, 4].includes(c.modules) ? c.modules : 1,
      category: VALID_CATEGORIES.includes(c.category) ? c.category : "autre",
    }));
}

export default function EtiquettesPhotoModal({ onClose, onImport, initialFile = null }) {
  const [file, setFile] = useState(initialFile);
  const [previewUrl, setPreviewUrl] = useState(
    initialFile ? URL.createObjectURL(initialFile) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [extracted, setExtracted] = useState(null); // null | array
  const [selected, setSelected] = useState({}); // index → bool
  const inputRef = useRef(null);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Le fichier doit être une image.");
      return;
    }
    setFile(f);
    setError(null);
    setExtracted(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const imageBase64 = await imageFileToBase64(file, 1600);
      const { data, error: fnErr } = await supabase.functions.invoke("plan-vision", {
        body: {
          imageBase64,
          mediaType: "image/jpeg",
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: USER_PROMPT,
        },
      });
      if (fnErr) {
        // supabase-js renvoie un message générique ("non-2xx status code")
        // qui masque l'erreur réelle. On extrait le vrai message depuis
        // le body de la réponse (rate limit, clé absente, erreur LLM…).
        let detail = fnErr.message;
        try {
          const body = await fnErr.context?.response?.clone?.()?.json?.();
          if (body?.error) detail = body.error;
        } catch {
          // body non JSON ou pas accessible — on garde le message générique
        }
        throw new Error(detail || "Erreur lors de l'analyse");
      }
      if (!data?.text) throw new Error("Réponse vide de l'IA");

      const circuits = parseCircuitsResponse(data.text);
      if (circuits.length === 0) {
        setError("Aucune étiquette détectée. Essayez une photo plus nette ou mieux cadrée.");
        return;
      }
      setExtracted(circuits);
      // Toutes sélectionnées par défaut
      setSelected(Object.fromEntries(circuits.map((_, i) => [i, true])));
    } catch (err) {
      setError(err.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  function toggle(i) {
    setSelected((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  function importSelected() {
    if (!extracted) return;
    const chosen = extracted.filter((_, i) => selected[i]);
    if (chosen.length === 0) return;
    onImport(chosen);
    onClose();
  }

  const selectedCount = extracted ? extracted.filter((_, i) => selected[i]).length : 0;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
              <Wand2 size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold dark:text-slate-100">Import IA depuis photo</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Photographiez le tableau avec ses étiquettes provisoires, l'IA fait le reste.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!extracted ? (
            <>
              {!previewUrl ? (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-slate-500 hover:border-amber-500 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-amber-500 dark:hover:bg-amber-900/20 dark:hover:text-amber-300"
                >
                  <Upload size={28} />
                  <span className="text-sm font-medium">Choisir ou prendre une photo</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Cadrez l'ensemble du tableau, étiquettes lisibles
                  </span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                    <img
                      src={previewUrl}
                      alt="Aperçu du tableau"
                      className="mx-auto max-h-72 object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => inputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                    >
                      <ImageIcon size={14} /> Changer la photo
                    </button>
                    <button
                      onClick={analyze}
                      disabled={loading}
                      className="flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Analyse en cours…
                        </>
                      ) : (
                        <>
                          <Wand2 size={14} /> Analyser avec l'IA
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">{extracted.length}</span>{" "}
                circuit{extracted.length > 1 ? "s" : ""} détecté
                {extracted.length > 1 ? "s" : ""} — décochez ceux que vous ne voulez pas importer :
              </p>
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {extracted.map((c, i) => (
                  <label
                    key={i}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[i]}
                      onChange={() => toggle(i)}
                      className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 dark:border-slate-500 dark:bg-slate-700"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{c.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {c.breaker} A{c.modules > 1 ? ` · ${c.modules}P` : ""} · {c.category}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Les libellés et calibres restent modifiables après import.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {extracted && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Annuler
            </button>
            <button
              onClick={importSelected}
              disabled={selectedCount === 0}
              className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Importer {selectedCount} circuit{selectedCount > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
