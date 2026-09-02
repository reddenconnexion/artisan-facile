import React, { useState } from 'react';
import { Inbox, Loader2, RefreshCw, Download, AlertCircle, CheckCircle, Clock, X, ExternalLink, FileText, ThumbsUp, ThumbsDown, Info, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DismissibleHelp } from '../components/ui';

const RECEIVED_INVOICES_BUCKET = 'received-invoices';

const STATUS_CONFIG = {
  new:          { label: 'À traiter',       color: 'bg-blue-100 text-blue-700 border-blue-200',   icon: Clock },
  processing:   { label: 'En traitement',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Loader2 },
  acknowledged: { label: 'Acceptée',        color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  rejected:     { label: 'Refusée',         color: 'bg-red-100 text-red-700 border-red-200',      icon: AlertCircle },
};

const fmt = (v) => v ?? '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtAmount = (v, currency = 'EUR') =>
  v != null ? `${Number(v).toFixed(2)} ${currency}` : '—';

/** Appelle l'Edge Function received-invoice-action (accept | refuse | fetch_pdf). */
const callReceivedInvoiceAction = async (id, action, extra = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Session expirée, veuillez vous reconnecter');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${supabaseUrl}/functions/v1/received-invoice-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ id, action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Erreur HTTP ${res.status}`);
  return body;
};

/** Ouvre le PDF conservé dans le bucket privé via une URL signée (1 h). */
const openStoredPdf = async (pdfPath) => {
  const { data, error } = await supabase.storage.from(RECEIVED_INVOICES_BUCKET).createSignedUrl(pdfPath, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Lien PDF indisponible');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
};

const DetailRow = ({ label, value }) => (
  <div className="flex justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
    <span className="text-sm text-gray-900 dark:text-white font-medium text-right">{value}</span>
  </div>
);

/** Bouton d'accès au PDF : conservé chez nous (URL signée), externe, ou à récupérer. */
const PdfAccess = ({ inv, onPdfFetched, compact = false }) => {
  const [busy, setBusy] = useState(false);

  const handleOpen = async (e) => {
    e?.stopPropagation();
    setBusy(true);
    try {
      await openStoredPdf(inv.pdf_path);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFetch = async (e) => {
    e?.stopPropagation();
    setBusy(true);
    try {
      const body = await callReceivedInvoiceAction(inv.id, 'fetch_pdf');
      onPdfFetched(inv.id, body.pdf_path);
      toast.success('PDF récupéré');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    if (inv.pdf_path) {
      return (
        <button type="button" onClick={handleOpen} disabled={busy} title="Ouvrir la facture"
          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors inline-flex disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </button>
      );
    }
    if (inv.pdf_url) {
      return (
        <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors inline-flex"
          title="Télécharger la facture">
          <Download className="w-4 h-4" />
        </a>
      );
    }
    return null;
  }

  if (inv.pdf_path) {
    return (
      <button type="button" onClick={handleOpen} disabled={busy}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
        Ouvrir le PDF
      </button>
    );
  }
  if (inv.pdf_url) {
    return (
      <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors">
        <ExternalLink className="w-4 h-4" />
        Ouvrir le PDF
      </a>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-500 dark:text-gray-400">
        <FileText className="w-4 h-4 shrink-0" />
        PDF non encore récupéré
      </div>
      {inv.b2brouter_id && (
        <button type="button" onClick={handleFetch} disabled={busy}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 text-sm font-semibold rounded-xl transition-colors">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Récupérer le PDF depuis la plateforme
        </button>
      )}
    </div>
  );
};

const InvoiceDrawer = ({ inv, onClose, onStatusChange, onPdfFetched }) => {
  const [actioning, setActioning] = useState(null); // 'accept' | 'refuse'
  const [showRefuse, setShowRefuse] = useState(false);
  const [refusalReason, setRefusalReason] = useState('');

  if (!inv) return null;
  const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.new;
  const Icon = cfg.icon;
  const canAct = !['acknowledged', 'rejected'].includes(inv.status);
  const linkedToPlatform = !!inv.b2brouter_id;

  const runAction = async (action) => {
    setActioning(action);
    try {
      const body = await callReceivedInvoiceAction(inv.id, action, action === 'refuse' ? { reason: refusalReason.trim() } : {});
      onStatusChange(inv.id, {
        status: body.status,
        refusal_reason: action === 'refuse' ? refusalReason.trim() : null,
        lifecycle_sent_at: body.lifecycle_sent_at ?? null,
        lifecycle_error: null,
      });
      toast.success(body.local
        ? `Facture marquée ${action === 'accept' ? 'acceptée' : 'refusée'} (repère local : facture non rattachée à la plateforme)`
        : `Statut « ${action === 'accept' ? 'acceptée' : 'refusée'} » transmis au fournisseur`);
      setShowRefuse(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActioning(null);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight truncate">
              {fmt(inv.supplier_name)}
            </p>
            {inv.supplier_siren && (
              <p className="text-xs text-gray-400 mt-0.5">SIREN {inv.supplier_siren}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color}`}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* PDF */}
          <PdfAccess inv={inv} onPdfFetched={onPdfFetched} />

          {/* Détails */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Détails de la facture</p>
            <div>
              <DetailRow label="N° facture" value={fmt(inv.invoice_number)} />
              <DetailRow label="Date de facture" value={fmtDate(inv.invoice_date)} />
              <DetailRow label="Date d'échéance" value={fmtDate(inv.due_date)} />
              <DetailRow label="Reçue le" value={fmtDate(inv.received_at)} />
            </div>
          </div>

          {/* Montants */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Montants</p>
            <div>
              <DetailRow label="Montant HT" value={fmtAmount(inv.total_ht, inv.currency)} />
              <DetailRow label="TVA" value={fmtAmount(
                inv.total_ttc != null && inv.total_ht != null ? inv.total_ttc - inv.total_ht : null,
                inv.currency
              )} />
              <DetailRow label="Montant TTC" value={
                <span className="text-base font-bold text-gray-900 dark:text-white">
                  {fmtAmount(inv.total_ttc, inv.currency)}
                </span>
              } />
            </div>
          </div>

          {/* Fournisseur */}
          {(inv.supplier_siren || inv.supplier_tin) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Fournisseur</p>
              <div>
                {inv.supplier_siren && <DetailRow label="SIREN" value={inv.supplier_siren} />}
                {inv.supplier_tin && <DetailRow label="N° TVA" value={inv.supplier_tin} />}
              </div>
            </div>
          )}

          {/* Cycle de vie */}
          {(inv.lifecycle_sent_at || inv.refusal_reason || inv.lifecycle_error) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Suivi transmis au fournisseur</p>
              <div>
                {inv.lifecycle_sent_at && <DetailRow label="Statut transmis le" value={fmtDateTime(inv.lifecycle_sent_at)} />}
                {inv.refusal_reason && <DetailRow label="Motif de refus" value={inv.refusal_reason} />}
              </div>
              {inv.lifecycle_error && (
                <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{inv.lifecycle_error}</p>
              )}
            </div>
          )}

          {/* ID B2BRouter */}
          {inv.b2brouter_id && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Référence plateforme</p>
              <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">{inv.b2brouter_id}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {canAct && (
          <div className="p-5 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Réponse au fournisseur</p>
            {!showRefuse ? (
              <div className="flex gap-3">
                <button
                  onClick={() => runAction('accept')}
                  disabled={!!actioning}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {actioning === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                  Accepter
                </button>
                <button
                  onClick={() => setShowRefuse(true)}
                  disabled={!!actioning}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-red-600 border border-red-200 dark:border-red-800 text-sm font-semibold rounded-xl transition-colors"
                >
                  <ThumbsDown className="w-4 h-4" />
                  Refuser
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="refusal-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Motif du refus <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="refusal-reason"
                  value={refusalReason}
                  onChange={e => setRefusalReason(e.target.value)}
                  rows={3}
                  placeholder="Ex. : montant différent du devis accepté, prestation non réalisée, doublon…"
                  className="w-full text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => runAction('refuse')}
                    disabled={!!actioning || refusalReason.trim().length < 3}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {actioning === 'refuse' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Envoyer le refus
                  </button>
                  <button
                    onClick={() => { setShowRefuse(false); setRefusalReason(''); }}
                    disabled={!!actioning}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
            <DismissibleHelp storageKey="received_invoices_lifecycle_note">
              <p className="flex items-start gap-1.5 text-xs text-gray-400 dark:text-gray-500 leading-relaxed pr-8">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                {linkedToPlatform
                  ? "Votre réponse est transmise au fournisseur par la plateforme : c'est le statut de cycle de vie exigé par la réforme. Un refus doit être motivé."
                  : "Facture non rattachée à la plateforme : la réponse ne sert que de repère personnel, elle n'est pas transmise au fournisseur."}
              </p>
            </DismissibleHelp>
          </div>
        )}
      </div>
    </>
  );
};

const ReceivedInvoices = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);

  const queryKey = ['receivedInvoices', user?.id];
  const { data: invoices = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('received_invoices')
        .select('*')
        .order('received_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });
  const loading = isLoading || isFetching;

  const selected = invoices.find(inv => inv.id === selectedId) ?? null;

  const patchInvoice = (id, patch) => {
    queryClient.setQueryData(queryKey, (prev = []) => prev.map(inv => inv.id === id ? { ...inv, ...patch } : inv));
  };

  const handleStatusChange = (id, patch) => {
    patchInvoice(id, patch);
    queryClient.invalidateQueries({ queryKey: ['newReceivedInvoices', user?.id] });
  };

  const handlePdfFetched = (id, pdfPath) => patchInvoice(id, { pdf_path: pdfPath });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Inbox className="w-7 h-7 text-indigo-600" />
          Factures reçues
        </h2>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Bandeau informatif */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 text-sm text-indigo-800 dark:text-indigo-300 space-y-1">
        <p>
          <strong>Réception obligatoire depuis le 1er septembre 2026</strong> — Les factures que vos fournisseurs vous adressent via leur Plateforme Agréée arrivent ici automatiquement, avec leur PDF.
        </p>
        <p className="text-indigo-700/80 dark:text-indigo-300/70">
          Répondez <em>Acceptée</em> ou <em>Refusée</em> (avec motif) : ce statut est renvoyé au fournisseur par la plateforme.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          Erreur de chargement : {error.message}
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center">
            <Inbox className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">Aucune facture reçue</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Vos factures fournisseurs apparaîtront ici dès qu'elles arriveront via B2BRouter.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {['Reçue le', 'Fournisseur', 'N° facture', 'Date', 'Échéance', 'Montant HT', 'Montant TTC', 'Statut', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {invoices.map(inv => {
                  const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.new;
                  const Icon = cfg.icon;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedId(inv.id)}
                      className="hover:bg-indigo-50/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(inv.received_at)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        <div>{fmt(inv.supplier_name)}</div>
                        {inv.supplier_siren && <div className="text-xs text-gray-400">SIREN {inv.supplier_siren}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{fmt(inv.invoice_number)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">{fmtAmount(inv.total_ht, inv.currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{fmtAmount(inv.total_ttc, inv.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color}`}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <PdfAccess inv={inv} onPdfFetched={handlePdfFetched} compact />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
            {invoices.map(inv => {
              const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.new;
              const Icon = cfg.icon;
              return (
                <div
                  key={inv.id}
                  onClick={() => setSelectedId(inv.id)}
                  className="p-4 space-y-2 active:bg-gray-50 dark:active:bg-gray-800 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{fmt(inv.supplier_name)}</p>
                      {inv.supplier_siren && <p className="text-xs text-gray-400">SIREN {inv.supplier_siren}</p>}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color} shrink-0`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Facture</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300">{fmt(inv.invoice_number)}</span>
                    <span className="text-gray-500 dark:text-gray-400">Date</span>
                    <span>{fmtDate(inv.invoice_date)}</span>
                    <span className="text-gray-500 dark:text-gray-400">Échéance</span>
                    <span>{fmtDate(inv.due_date)}</span>
                    <span className="text-gray-500 dark:text-gray-400">Montant TTC</span>
                    <span className="font-semibold">{fmtAmount(inv.total_ttc, inv.currency)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* key : le formulaire de refus repart à zéro quand on change de facture */}
      <InvoiceDrawer
        key={selectedId ?? 'none'}
        inv={selected}
        onClose={() => setSelectedId(null)}
        onStatusChange={handleStatusChange}
        onPdfFetched={handlePdfFetched}
      />
    </div>
  );
};

export default ReceivedInvoices;
