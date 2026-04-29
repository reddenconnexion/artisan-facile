import React, { useState, useEffect } from 'react';
import { Inbox, Loader2, RefreshCw, Download, AlertCircle, CheckCircle, Clock, X, ExternalLink, FileText, ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

const STATUS_CONFIG = {
  new:          { label: 'Nouvelle',        color: 'bg-blue-100 text-blue-700 border-blue-200',   icon: Clock },
  processing:   { label: 'En traitement',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Loader2 },
  acknowledged: { label: 'Intégrée',        color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  rejected:     { label: 'Rejetée',         color: 'bg-red-100 text-red-700 border-red-200',      icon: AlertCircle },
};

const fmt = (v) => v ?? '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtAmount = (v, currency = 'EUR') =>
  v != null ? `${Number(v).toFixed(2)} ${currency}` : '—';

const DetailRow = ({ label, value }) => (
  <div className="flex justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <span className="text-sm text-gray-500 shrink-0">{label}</span>
    <span className="text-sm text-gray-900 dark:text-white font-medium text-right">{value}</span>
  </div>
);

const InvoiceDrawer = ({ inv, onClose, onStatusChange }) => {
  if (!inv) return null;
  const [actioning, setActioning] = useState(null); // 'acknowledged' | 'rejected'
  const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.new;
  const Icon = cfg.icon;

  const handleStatusChange = async (newStatus) => {
    setActioning(newStatus);
    const { error } = await supabase
      .from('received_invoices')
      .update({ status: newStatus })
      .eq('id', inv.id);
    setActioning(null);
    if (!error) onStatusChange(inv.id, newStatus);
  };

  const canAct = !['acknowledged', 'rejected'].includes(inv.status);

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
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* PDF */}
          {inv.pdf_url ? (
            <a
              href={inv.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Ouvrir le PDF
            </a>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-500">
              <FileText className="w-4 h-4 shrink-0" />
              Aucun PDF joint à cette facture
            </div>
          )}

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

          {/* ID B2BRouter */}
          {inv.b2brouter_id && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Référence plateforme</p>
              <p className="text-xs font-mono text-gray-500 break-all">{inv.b2brouter_id}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {canAct && (
          <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex gap-3">
            <button
              onClick={() => handleStatusChange('acknowledged')}
              disabled={!!actioning}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {actioning === 'acknowledged' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              Intégrée
            </button>
            <button
              onClick={() => handleStatusChange('rejected')}
              disabled={!!actioning}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 border border-red-200 text-sm font-semibold rounded-xl transition-colors"
            >
              {actioning === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
              Rejeter
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const ReceivedInvoices = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const handleStatusChange = (id, newStatus) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: newStatus } : inv));
    setSelected(prev => prev?.id === id ? { ...prev, status: newStatus } : prev);
    queryClient.invalidateQueries({ queryKey: ['newReceivedInvoices', user?.id] });
  };

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('received_invoices')
      .select('*')
      .order('received_at', { ascending: false });
    if (error) setError(error.message);
    else setInvoices(data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchInvoices(); }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Inbox className="w-7 h-7 text-indigo-600" />
          Factures reçues
        </h2>
        <button
          onClick={fetchInvoices}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Bandeau informatif */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-800">
        <strong>Obligation de réception (sept. 2026)</strong> — Les factures que vos fournisseurs vous transmettent via leur Plateforme Agréée apparaissent ici automatiquement.
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Erreur de chargement : {error}
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center">
            <Inbox className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">Aucune facture reçue</p>
            <p className="text-sm text-gray-500 mt-1">
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
                      onClick={() => setSelected(inv)}
                      className="hover:bg-indigo-50/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.received_at)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        <div>{fmt(inv.supplier_name)}</div>
                        {inv.supplier_siren && <div className="text-xs text-gray-400">SIREN {inv.supplier_siren}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{fmt(inv.invoice_number)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">{fmtAmount(inv.total_ht, inv.currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{fmtAmount(inv.total_ttc, inv.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color}`}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {inv.pdf_url && (
                          <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors inline-flex"
                            title="Télécharger la facture"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
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
                  onClick={() => setSelected(inv)}
                  className="p-4 space-y-2 active:bg-gray-50 cursor-pointer"
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
                    <span className="text-gray-500">Facture</span>
                    <span className="font-mono text-gray-700">{fmt(inv.invoice_number)}</span>
                    <span className="text-gray-500">Date</span>
                    <span>{fmtDate(inv.invoice_date)}</span>
                    <span className="text-gray-500">Échéance</span>
                    <span>{fmtDate(inv.due_date)}</span>
                    <span className="text-gray-500">Montant TTC</span>
                    <span className="font-semibold">{fmtAmount(inv.total_ttc, inv.currency)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <InvoiceDrawer inv={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />
    </div>
  );
};

export default ReceivedInvoices;
