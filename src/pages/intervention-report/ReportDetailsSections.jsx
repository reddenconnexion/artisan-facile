import React from 'react';
import { ClipboardList, Clock, MapPin, Wrench, StickyNote, Mic, MicOff, Loader2, Sparkles, FilePlus, TrendingUp, AlertCircle } from 'lucide-react';
import { Input, Field } from '../../components/ui';
import { formatCompactCurrency } from '../../utils/format';
import { nowHHMM } from './reportFormUtils';

export const GeneralInfoSection = ({
    formData, updateField,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-500" />
            Informations générales
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field className="md:col-span-2" label="Titre de l'intervention" required>
                <Input
                    type="text"
                    value={formData.title}
                    onChange={e => updateField('title', e.target.value)}
                    placeholder="Ex : Dépannage fuite sous-évier, salle de bain..."
                />
            </Field>
            <Field label="N° de rapport">
                <Input
                    type="text"
                    value={formData.report_number}
                    onChange={e => updateField('report_number', e.target.value)}
                    placeholder="INT-2024-001"
                />
            </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Date">
                <Input
                    type="date"
                    value={formData.date}
                    onChange={e => updateField('date', e.target.value)}
                />
            </Field>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Statut
                </label>
                <select
                    value={formData.status}
                    onChange={e => updateField('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-ios"
                >
                    <option value="draft">Brouillon</option>
                    <option value="completed">Terminé</option>
                    <option value="signed">Signé</option>
                </select>
            </div>
        </div>
    </div>
);

export const LocationSection = ({
    formData, updateField,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-500" />
            Lieu d'intervention
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field className="md:col-span-3" label="Adresse">
                <Input
                    type="text"
                    value={formData.intervention_address}
                    onChange={e => updateField('intervention_address', e.target.value)}
                    placeholder="N° et nom de rue"
                />
            </Field>
            <Field label="Code postal">
                <Input
                    type="text"
                    value={formData.intervention_postal_code}
                    onChange={e => updateField('intervention_postal_code', e.target.value)}
                    placeholder="75001"
                />
            </Field>
            <Field className="md:col-span-2" label="Ville">
                <Input
                    type="text"
                    value={formData.intervention_city}
                    onChange={e => updateField('intervention_city', e.target.value)}
                    placeholder="Paris"
                />
            </Field>
        </div>
    </div>
);

// Résultats de l'analyse IA d'une visite technique.
export const SiteVisitMetaSection = ({
    siteVisitMeta, handleCreateDevisFromVisit,
}) => (
    <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-200 dark:border-violet-700 p-6 space-y-4">
        <h2 className="font-semibold text-violet-900 dark:text-violet-300 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-600" />
            Résultats de l'analyse IA
        </h2>
        <div className="grid grid-cols-2 gap-4">
            {siteVisitMeta.price_range && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-violet-100 dark:border-violet-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fourchette estimée</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCompactCurrency(siteVisitMeta.price_range.min)} – {formatCompactCurrency(siteVisitMeta.price_range.max)}
                    </p>
                </div>
            )}
            {siteVisitMeta.estimated_duration && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-violet-100 dark:border-violet-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Durée estimée</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{siteVisitMeta.estimated_duration}</p>
                </div>
            )}
        </div>
        {siteVisitMeta.suggestions?.length > 0 && (
            <div>
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Points d'attention
                </p>
                <ul className="space-y-1">
                    {siteVisitMeta.suggestions.map((s, i) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0 mt-1.5" />
                            {s}
                        </li>
                    ))}
                </ul>
            </div>
        )}
        <div className="pt-2 border-t border-violet-200 dark:border-violet-700">
            <button
                onClick={handleCreateDevisFromVisit}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors font-medium text-sm"
            >
                <FilePlus className="w-4 h-4" />
                Créer le devis final à partir de cette visite
            </button>
        </div>
    </div>
);

export const TimeTrackingSection = ({
    formData, updateField,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            Suivi du temps
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Heure début">
                <Input
                    type="time"
                    value={formData.start_time}
                    onChange={e => updateField('start_time', e.target.value)}
                />
                <button
                    type="button"
                    onClick={() => updateField('start_time', nowHHMM())}
                    className="mt-2 w-full min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                >
                    <Clock className="w-4 h-4" />
                    Maintenant
                </button>
            </Field>
            <Field label="Heure fin">
                <Input
                    type="time"
                    value={formData.end_time}
                    onChange={e => updateField('end_time', e.target.value)}
                />
                <button
                    type="button"
                    onClick={() => updateField('end_time', nowHHMM())}
                    className="mt-2 w-full min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                >
                    <Clock className="w-4 h-4" />
                    Maintenant
                </button>
            </Field>
            <Field label="Durée (h)" className="col-span-2 sm:col-span-1">
                <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={formData.duration_hours}
                    onChange={e => updateField('duration_hours', e.target.value)}
                    placeholder="1.5"
                />
            </Field>
        </div>
    </div>
);

export const WorkDescriptionSection = ({
    formData, updateField, isSiteVisit,
    micSupported, isRecording, processingAudio, recordingDuration, handleDictate,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-500" />
                {isSiteVisit ? 'Notes de visite' : 'Description des travaux'}
            </h2>
            {!isSiteVisit && micSupported && (
                <button
                    type="button"
                    onClick={handleDictate}
                    disabled={processingAudio}
                    title={isRecording ? 'Arrêter la dictée' : 'Dicter le rapport vocalement'}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isRecording
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
                            : processingAudio
                                ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                                : 'bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400'
                    }`}
                >
                    {processingAudio
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</>
                        : isRecording
                            ? <><MicOff className="w-4 h-4" /> Arrêter ({recordingDuration}s)</>
                            : <><Mic className="w-4 h-4" /><Sparkles className="w-3 h-3" /> Dicter</>
                    }
                </button>
            )}
        </div>
        <Field label="Problème constaté / Description de la demande">
            <Input
                as="textarea"
                value={formData.description}
                onChange={e => updateField('description', e.target.value)}
                rows={3}
                placeholder="Décrire le problème ou la demande du client..."
                className="resize-none"
            />
        </Field>
        {!isSiteVisit && (
        <Field label="Travaux réalisés">
            <Input
                as="textarea"
                value={formData.work_done}
                onChange={e => updateField('work_done', e.target.value)}
                rows={4}
                placeholder="Décrire en détail les travaux effectués, les pièces remplacées, les réglages effectués..."
                className="resize-none"
            />
        </Field>
        )}
    </div>
);

export const NotesSection = ({
    formData, updateField,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-blue-500" />
            Notes internes
        </h2>
        <textarea
            value={formData.notes}
            onChange={e => updateField('notes', e.target.value)}
            rows={3}
            placeholder="Notes, remarques, recommandations pour le client ou usage interne..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-ios focus:border-transparent resize-none"
        />
    </div>
);
