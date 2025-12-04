import React from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

const MarginGauge = ({ totalHT, totalCost }) => {
    const margin = totalHT - totalCost;
    const marginPercent = totalHT > 0 ? (margin / totalHT) * 100 : 0;

    let colorClass = 'text-red-600';
    let bgClass = 'bg-red-100';
    let Icon = TrendingDown;
    let label = 'Faible';

    if (marginPercent >= 40) {
        colorClass = 'text-green-600';
        bgClass = 'bg-green-100';
        Icon = TrendingUp;
        label = 'Excellente';
    } else if (marginPercent >= 20) {
        colorClass = 'text-orange-600';
        bgClass = 'bg-orange-100';
        Icon = AlertTriangle;
        label = 'Correcte';
    }

    return (
        <div className={`p-4 rounded-lg border ${bgClass} border-opacity-50`}>
            <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${colorClass} flex items-center`}>
                    <Icon className="w-4 h-4 mr-1" />
                    Marge estimée ({label})
                </span>
                <span className={`text-lg font-bold ${colorClass}`}>
                    {marginPercent.toFixed(1)}%
                </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${marginPercent >= 40 ? 'bg-green-500' : marginPercent >= 20 ? 'bg-orange-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(Math.max(marginPercent, 0), 100)}%` }}
                ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-600">
                <span>Coût: {totalCost.toFixed(2)} €</span>
                <span>Profit: {margin.toFixed(2)} €</span>
            </div>
        </div>
    );
};

export default MarginGauge;
