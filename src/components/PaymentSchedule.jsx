import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Plus, Trash2, Calendar, DollarSign, CheckCircle, AlertCircle, Clock, Bell } from 'lucide-react';
import { sendInstallmentReminder } from '../utils/followUpService';

const PaymentSchedule = ({ invoiceId, totalAmount, onScheduleChange }) => {
    const [installments, setInstallments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedInstallment, setSelectedInstallment] = useState(null);

    useEffect(() => {
        if (invoiceId) {
            fetchInstallments();
        } else {
            setLoading(false);
        }
    }, [invoiceId]);

    const fetchInstallments = async () => {
        try {
            const { data, error } = await supabase
                .from('invoice_installments')
                .select('*, quotes (id, title, client_id, user_id, clients (name, email))')
                .eq('quote_id', invoiceId)
                .order('due_date', { ascending: true });

            if (error) throw error;
            setInstallments(data || []);
            onScheduleChange && onScheduleChange(data || []);
        } catch (error) {
            console.error("Error fetching installments:", error);
            // toast.error("Erreur chargement échéancier");
        } finally {
            setLoading(false);
        }
    };

    const handleRemind = async (inst) => {
        if (!inst.quotes?.user_id) return;
        try {
            await sendInstallmentReminder(inst, inst.quotes.user_id);
            toast.success("Rappel envoyé par email");
            fetchInstallments(); // Refresh to update reminder count/status
        } catch (e) {
            console.error(e);
            toast.error("Erreur envoi rappel");
        }
    };

    const generateSchedule = async (count) => {
        if (!totalAmount) return;
        const amountPerInst = totalAmount / count;
        const today = new Date();

        const newInstallments = [];
        for (let i = 0; i < count; i++) {
            const date = new Date(today);
            date.setMonth(date.getMonth() + i);

            newInstallments.push({
                quote_id: invoiceId,
                due_date: date.toISOString().split('T')[0],
                amount: parseFloat(amountPerInst.toFixed(2)),
                amount_paid: 0,
                status: 'pending'
            });
        }

        // Adjust last installment for rounding errors
        const sum = newInstallments.reduce((acc, curr) => acc + curr.amount, 0);
        const diff = totalAmount - sum;
        if (Math.abs(diff) > 0.001) {
            newInstallments[newInstallments.length - 1].amount += diff;
        }

        try {
            // Delete existing
            await supabase.from('invoice_installments').delete().eq('quote_id', invoiceId);

            // Insert new
            const { data, error } = await supabase.from('invoice_installments').insert(newInstallments).select();
            if (error) throw error;

            setInstallments(data);
            toast.success("Échéancier généré");
            onScheduleChange && onScheduleChange(data);
        } catch (e) {
            console.error(e);
            toast.error("Erreur génération");
        }
    };

    const updateStatus = async (inst, newStatus) => {
        try {
            const { error } = await supabase
                .from('invoice_installments')
                .update({ status: newStatus })
                .eq('id', inst.id);

            if (error) throw error;
            fetchInstallments();
        } catch (e) {
            toast.error("Erreur mise à jour statut");
        }
    };

    const getStatusColor = (status, date) => {
        if (status === 'paid') return 'text-green-600 bg-green-50 border-green-200';
        if (status === 'partial') return 'text-orange-600 bg-orange-50 border-orange-200';

        const isLate = new Date(date) < new Date() && status !== 'paid';
        if (isLate) return 'text-red-600 bg-red-50 border-red-200';

        return 'text-gray-600 bg-gray-50 border-gray-200';
    };

    if (loading) return <div className="text-sm text-gray-500">Chargement de l'échéancier...</div>;

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-800 flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    Échéancier de paiement
                </h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => generateSchedule(2)}
                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                        2x
                    </button>
                    <button
                        onClick={() => generateSchedule(3)}
                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                        3x
                    </button>
                    <button
                        onClick={() => generateSchedule(4)}
                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                        4x
                    </button>
                </div>
            </div>

            {installments.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                    Aucun échéancier défini.
                    <br />
                    Cliquez sur une option ci-dessus pour générer automatiquement.
                </div>
            ) : (
                <div className="space-y-2">
                    {installments.map((inst, idx) => (
                        <div key={inst.id} className={`flex items-center justify-between p-3 rounded-md border ${getStatusColor(inst.status, inst.due_date)}`}>
                            <div className="flex items-center gap-3">
                                <div className="text-sm font-medium">#{idx + 1}</div>
                                <div className="text-sm">
                                    <div className="font-semibold">{inst.amount.toFixed(2)} €</div>
                                    <div className="text-xs opacity-75">
                                        le {new Date(inst.due_date).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {(new Date(inst.due_date) < new Date() && inst.status !== 'paid') && (
                                    <button
                                        onClick={() => handleRemind(inst)}
                                        className="p-1 px-2 flex items-center gap-1 text-xs text-red-600 bg-red-100 hover:bg-red-200 rounded border border-red-200"
                                        title="Envoyer un rappel par email"
                                    >
                                        <Bell className="w-3 h-3" />
                                        Relancer {inst.reminded_count > 0 && `(${inst.reminded_count})`}
                                    </button>
                                )}
                                <select
                                    value={inst.status}
                                    onChange={(e) => updateStatus(inst, e.target.value)}
                                    className="text-xs border-none bg-transparent focus:ring-0 font-medium cursor-pointer"
                                >
                                    <option value="pending">En attente</option>
                                    <option value="paid">Payé</option>
                                    <option value="late">Retard</option>
                                    <option value="partial">Partiel</option>
                                </select>
                            </div>
                        </div>
                    ))}

                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm font-medium">
                        <span>Total planifié :</span>
                        <span>{installments.reduce((sum, i) => sum + i.amount, 0).toFixed(2)} €</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentSchedule;
