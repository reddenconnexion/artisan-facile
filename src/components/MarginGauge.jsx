import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Clock, Plus, Minus, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const MarginGauge = ({ quoteId, items, userId }) => {
    const [hoursSpent, setHoursSpent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showInput, setShowInput] = useState(false);
    const [newHours, setNewHours] = useState('');

    // Calculate estimated hours from quote items
    // Assuming 'h' or 'heure' units, or just general estimation
    const estimatedHours = items.reduce((acc, item) => {
        // Naive check for time-based units
        if (['h', 'heure', 'heures', 'h.'].includes(item.unit?.toLowerCase())) {
            return acc + (parseFloat(item.quantity) || 0);
        }
        // If 'forfait', maybe user defines hours elsewhere? 
        // For simplicity, we only count explicit hours for now, 
        // OR we could add an 'estimated_time' field to items later.
        return acc;
    }, 0);

    useEffect(() => {
        if (quoteId) fetchTracking();
    }, [quoteId]);

    const fetchTracking = async () => {
        try {
            const { data, error } = await supabase
                .from('task_tracking')
                .select('hours_spent')
                .eq('quote_id', quoteId);

            if (error) throw error;

            const total = data.reduce((sum, record) => sum + (record.hours_spent || 0), 0);
            setHoursSpent(total);
        } catch (error) {
            console.error('Error fetching tracking:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddHours = async (e) => {
        e.preventDefault();
        const amount = parseFloat(newHours);
        if (!amount || amount === 0) return;

        try {
            const { error } = await supabase
                .from('task_tracking')
                .insert([{
                    user_id: userId,
                    quote_id: quoteId,
                    hours_spent: amount,
                    date: new Date().toISOString().split('T')[0]
                }]);

            if (error) throw error;

            setHoursSpent(prev => prev + amount);
            setNewHours('');
            setShowInput(false);
            toast.success('Heures enregistrées');
        } catch (error) {
            toast.error("Erreur d'enregistrement");
        }
    };

    if (estimatedHours === 0) return null; // Don't show if no hours projected

    const percentage = Math.min((hoursSpent / estimatedHours) * 100, 100);
    const isOverBudget = hoursSpent > estimatedHours;

    return (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mt-6">
            <div className="flex justify-between items-end mb-2">
                <div>
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        Suivi du temps (Rentabilité)
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                        {hoursSpent}h passées / {estimatedHours}h vendues
                    </p>
                </div>
                <div className="text-right">
                    {!showInput ? (
                        <button
                            onClick={() => setShowInput(true)}
                            className="text-xs font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-blue-100 transition-colors"
                        >
                            + Saisir temps
                        </button>
                    ) : (
                        <form onSubmit={handleAddHours} className="flex gap-2">
                            <input
                                type="number"
                                step="0.5"
                                className="w-16 text-xs border border-gray-300 rounded px-1"
                                placeholder="Heures"
                                value={newHours}
                                onChange={e => setNewHours(e.target.value)}
                                autoFocus
                            />
                            <button type="submit" className="bg-blue-600 text-white rounded px-2 py-1 text-xs">OK</button>
                            <button onClick={() => setShowInput(false)} type="button" className="text-gray-400 text-xs px-1">X</button>
                        </form>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                    className={`absolute top-0 left-0 h-full transition-all duration-500 ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {/* Status Message */}
            <div className="mt-2 text-xs flex items-center justify-end font-medium">
                {isOverBudget ? (
                    <span className="text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Dépassement de {hoursSpent - estimatedHours}h
                    </span>
                ) : (
                    <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Dans les temps
                    </span>
                )}
            </div>
        </div>
    );
};

export default MarginGauge;
