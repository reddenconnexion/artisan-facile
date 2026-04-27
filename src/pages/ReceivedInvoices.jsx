import React, { useState, useEffect } from 'react';
import { Inbox, Loader2, RefreshCw, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

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

const ReceivedInvoices = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
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
                      <td className="px-4 py-3">
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
                <div key={inv.id} className="p-4 space-y-2">
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
    </div>
  );
};

export default ReceivedInvoices;
