import React, { useState } from 'react';
import { Plus, Minus, Trash2, Check, AlertTriangle, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { createEmptyZone, contexteValueText } from '../utils/surveyText';

// Formulaire de trame de relevé (mode Visite technique). Composant 100 %
// contrôlé : { template, survey, onChange } — aucune logique métier ici,
// l'assemblage du texte vit dans src/utils/surveyText.js.
// Pensé pour une saisie au pouce sur chantier : steppers larges, claviers
// numériques natifs, pastilles à taper plutôt que du texte à écrire.

const sectionTitle = 'text-xs font-bold text-gray-500 uppercase tracking-wide';
const inputClass = 'w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent';

const Stepper = ({ value, onChange }) => {
    const n = Number(value) || 0;
    return (
        <div className="flex items-center gap-1 flex-shrink-0">
            <button
                type="button"
                onClick={() => onChange(Math.max(0, n - 1))}
                className="w-11 h-11 flex items-center justify-center bg-gray-100 rounded-xl text-gray-600 active:scale-95 transition-transform"
                aria-label="Diminuer"
            >
                <Minus className="w-4 h-4" />
            </button>
            <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={n === 0 ? '' : String(n)}
                placeholder="0"
                onChange={(e) => {
                    const parsed = parseInt(e.target.value.replace(/\D/g, ''), 10);
                    onChange(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                }}
                className="w-11 h-11 text-center text-base font-semibold tabular-nums bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <button
                type="button"
                onClick={() => onChange(n + 1)}
                className="w-11 h-11 flex items-center justify-center bg-violet-100 rounded-xl text-violet-700 active:scale-95 transition-transform"
                aria-label="Augmenter"
            >
                <Plus className="w-4 h-4" />
            </button>
        </div>
    );
};

// Une pastille = un tap. Sélection simple (re-tap = désélection) ou multiple.
const Chips = ({ options, value, multi, onChange }) => {
    const selected = multi ? (Array.isArray(value) ? value : []) : value;
    const isOn = (opt) => (multi ? selected.includes(opt) : selected === opt);
    const toggle = (opt) => {
        if (!multi) return onChange(selected === opt ? '' : opt);
        return onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
    };
    return (
        <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        isOn(opt)
                            ? 'bg-violet-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    {opt}
                </button>
            ))}
        </div>
    );
};

const ContextField = ({ field, value, onChange }) => (
    <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5">
            {field.label}
            {field.unit && <span className="text-gray-400 font-normal"> ({field.unit})</span>}
        </p>
        {field.type === 'chips' ? (
            <Chips options={field.options} value={value} multi={field.multi} onChange={onChange} />
        ) : (
            <input
                type="text"
                {...(field.type === 'number' ? { inputMode: 'decimal' } : {})}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={field.placeholder || ''}
                className={inputClass}
            />
        )}
    </div>
);

// Nomme la pièce ajoutée : « Chambre », puis « Chambre 2 », « Chambre 3 »…
const nextZoneName = (zones, preset) => {
    const taken = new Set(zones.map((z) => (z.name || '').trim().toLowerCase()));
    if (!taken.has(preset.toLowerCase())) return preset;
    let n = 2;
    while (taken.has(`${preset} ${n}`.toLowerCase())) n += 1;
    return `${preset} ${n}`;
};

const SurveyForm = ({ template, survey, onChange }) => {
    const [openGroup, setOpenGroup] = useState(template.contextGroups?.[0]?.key || null);

    const updateZone = (zoneId, patch) => onChange({
        ...survey,
        zones: survey.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)),
    });
    const updateTableau = (patch) => onChange({ ...survey, tableau: { ...survey.tableau, ...patch } });
    const updateContexte = (groupKey, fieldKey, value) => onChange({
        ...survey,
        contexte: {
            ...survey.contexte,
            [groupKey]: { ...(survey.contexte?.[groupKey] || {}), [fieldKey]: value },
        },
    });
    const addZone = (name = '') => onChange({ ...survey, zones: [...survey.zones, { ...createEmptyZone(), name }] });
    const duplicateZone = (zone) => onChange({
        ...survey,
        zones: [...survey.zones, {
            ...createEmptyZone(),
            name: nextZoneName(survey.zones, (zone.name || '').replace(/\s+\d+$/, '').trim()),
            counters: { ...zone.counters },
            fields: { ...zone.fields },
        }],
    });
    const toggleChecklist = (itemId, state) => {
        const current = survey.checklist[itemId];
        onChange({
            ...survey,
            checklist: { ...survey.checklist, [itemId]: current === state ? undefined : state },
        });
    };

    const groupFilledCount = (group) => (group.fields || [])
        .filter((f) => contexteValueText(survey.contexte?.[group.key]?.[f.key]) !== '').length;

    return (
        <div className="space-y-5">
            {/* ── Demande du client ── */}
            <div>
                <p className={`${sectionTitle} mb-2`}>Ce que le client demande</p>
                <textarea
                    rows={3}
                    value={survey.demande || ''}
                    onChange={(e) => onChange({ ...survey, demande: e.target.value })}
                    placeholder="Dans ses mots : « refaire l'électricité du rez-de-chaussée, ajouter des prises dans la cuisine… »"
                    className={`${inputClass} resize-none`}
                />
            </div>

            {/* ── Contexte du chantier ── */}
            {(template.contextGroups || []).length > 0 && (
                <div>
                    <p className={`${sectionTitle} mb-2`}>Contexte du chantier</p>
                    <div className="space-y-2">
                        {template.contextGroups.map((group) => {
                            const isOpen = openGroup === group.key;
                            const filled = groupFilledCount(group);
                            return (
                                <div key={group.key} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setOpenGroup(isOpen ? null : group.key)}
                                        className="w-full flex items-center gap-2 px-3 py-3 text-left"
                                    >
                                        <span className="flex-1 text-sm font-semibold text-gray-800">{group.label}</span>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                            filled > 0 ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'
                                        }`}>
                                            {filled}/{group.fields.length}
                                        </span>
                                        {isOpen
                                            ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                            : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                    </button>
                                    {isOpen && (
                                        <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
                                            {group.fields.map((field) => (
                                                <ContextField
                                                    key={field.key}
                                                    field={field}
                                                    value={survey.contexte?.[group.key]?.[field.key]}
                                                    onChange={(v) => updateContexte(group.key, field.key, v)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Zones ── */}
            <div>
                <p className={`${sectionTitle} mb-2`}>Relevé par pièce</p>

                {/* Ajout en un tap */}
                {(template.zonePresets || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {template.zonePresets.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => addZone(nextZoneName(survey.zones, preset))}
                                className="flex items-center gap-1 px-3 py-2 bg-white border border-violet-200 rounded-xl text-xs font-semibold text-violet-700 hover:bg-violet-50 active:scale-95 transition-all"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                {preset}
                            </button>
                        ))}
                    </div>
                )}

                <div className="space-y-3">
                    {survey.zones.map((zone, index) => (
                        <div key={zone.id} className="bg-white border border-gray-200 rounded-2xl p-3 space-y-3">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={zone.name}
                                    onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                                    placeholder={`Pièce ${index + 1} — cuisine, salon, SdB…`}
                                    className={`${inputClass} font-semibold`}
                                />
                                <button
                                    type="button"
                                    onClick={() => duplicateZone(zone)}
                                    className="w-11 h-11 flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-violet-600 rounded-xl hover:bg-violet-50 transition-colors"
                                    aria-label="Dupliquer la pièce"
                                    title="Dupliquer (chambres identiques…)"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onChange({ ...survey, zones: survey.zones.filter((z) => z.id !== zone.id) })}
                                    className="w-11 h-11 flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors"
                                    aria-label="Supprimer la pièce"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            {template.zoneCounters.map(({ key, label }) => (
                                <div key={key} className="flex items-center justify-between gap-2">
                                    <span className="text-sm text-gray-700 leading-tight">{label}</span>
                                    <Stepper
                                        value={zone.counters[key]}
                                        onChange={(n) => updateZone(zone.id, { counters: { ...zone.counters, [key]: n } })}
                                    />
                                </div>
                            ))}
                            {template.zoneExtraFields.map(({ key, label, placeholder }) => (
                                <div key={key}>
                                    <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                                    <input
                                        type="text"
                                        value={zone.fields[key] || ''}
                                        onChange={(e) => updateZone(zone.id, { fields: { ...zone.fields, [key]: e.target.value } })}
                                        placeholder={placeholder}
                                        className={inputClass}
                                    />
                                </div>
                            ))}
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => addZone()}
                        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-violet-200 rounded-2xl text-sm font-semibold text-violet-600 hover:bg-violet-50 transition-colors active:scale-[0.98]"
                    >
                        <Plus className="w-4 h-4" />
                        Ajouter une pièce
                    </button>
                </div>
            </div>

            {/* ── Tableau électrique ── */}
            {template.hasTableau && (
                <div>
                    <p className={`${sectionTitle} mb-2`}>Tableau électrique</p>
                    <div className="bg-white border border-gray-200 rounded-2xl p-3 space-y-3">
                        <div className="grid grid-cols-3 gap-1.5">
                            {template.tableauEtats.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => updateTableau({ etat: survey.tableau.etat === value ? '' : value })}
                                    className={`py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                                        survey.tableau.etat === value
                                            ? 'bg-violet-600 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                            <span className="text-sm text-gray-700">
                                Rénovation complète du tableau
                                <span className="block text-xs text-gray-400">⇒ parafoudre type 2 par défaut</span>
                            </span>
                            <input
                                type="checkbox"
                                checked={survey.tableau.renovationComplete}
                                onChange={(e) => updateTableau({ renovationComplete: e.target.checked })}
                                className="w-5 h-5 rounded text-violet-600 focus:ring-violet-500 flex-shrink-0"
                            />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { key: 'rangees', label: 'Rangées existantes' },
                                { key: 'placesDispo', label: 'Places disponibles' },
                                { key: 'diffTypeA', label: 'Diff. type A 30 mA à créer' },
                                { key: 'diffTypeAC', label: 'Diff. type AC 30 mA à créer' },
                            ].map(({ key, label }) => (
                                <div key={key}>
                                    <p className="text-xs font-medium text-gray-500 mb-1 leading-tight">{label}</p>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={survey.tableau[key]}
                                        onChange={(e) => updateTableau({ [key]: e.target.value.replace(/\D/g, '') })}
                                        placeholder="0"
                                        className={`${inputClass} tabular-nums`}
                                    />
                                </div>
                            ))}
                        </div>
                        <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">Disjoncteurs à créer</p>
                            <input
                                type="text"
                                value={survey.tableau.disjoncteurs}
                                onChange={(e) => updateTableau({ disjoncteurs: e.target.value })}
                                placeholder="2 × 32A four/plaque, 3 × 16A prises…"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">Observations coffret</p>
                            <textarea
                                rows={2}
                                value={survey.tableau.observations}
                                onChange={(e) => updateTableau({ observations: e.target.value })}
                                placeholder="État général, repérage, accessibilité…"
                                className={`${inputClass} resize-none`}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Check-list conformité ── */}
            {template.checklist.length > 0 && (
                <div>
                    <p className={`${sectionTitle} mb-2`}>Check-list conformité</p>
                    <div className="bg-white border border-gray-200 rounded-2xl p-3 space-y-3">
                        {template.checklist.map(({ id, label, hint }) => {
                            const state = survey.checklist[id];
                            return (
                                <div key={id} className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm text-gray-700 leading-tight">{label}</p>
                                        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => toggleChecklist(id, 'verifie')}
                                            className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                                state === 'verifie'
                                                    ? 'bg-emerald-500 text-white'
                                                    : 'bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600'
                                            }`}
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Vérifié
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleChecklist(id, 'prevu')}
                                            className={`px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                                state === 'prevu'
                                                    ? 'bg-orange-500 text-white'
                                                    : 'bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600'
                                            }`}
                                        >
                                            À prévoir
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {template.checklistWarning && (
                            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700">{template.checklistWarning}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Non-conformités ── */}
            <div>
                <p className={`${sectionTitle} mb-2`}>Non-conformités relevées</p>
                <textarea
                    rows={3}
                    value={survey.nonConformites}
                    onChange={(e) => onChange({ ...survey, nonConformites: e.target.value })}
                    placeholder="Décrivez les non-conformités constatées — elles seront consignées sur le devis."
                    className={`${inputClass} resize-none`}
                />
            </div>

            {/* ── Notes libres ── */}
            <div>
                <p className={`${sectionTitle} mb-2`}>Notes libres</p>
                <textarea
                    rows={3}
                    value={survey.notesLibres}
                    onChange={(e) => onChange({ ...survey, notesLibres: e.target.value })}
                    placeholder="Accès, contraintes, distances, points d'attention…"
                    className={`${inputClass} resize-none`}
                />
            </div>
        </div>
    );
};

export default SurveyForm;
