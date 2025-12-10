
import React, { useState, useEffect } from 'react';
import { Calculator, X, Save } from 'lucide-react';

const MaterialsCalculator = ({ isOpen, onClose, onApply }) => {
    const [mode, setMode] = useState('paint'); // 'paint', 'tiling', 'wallpaper'
    const [dimensions, setDimensions] = useState({ length: 0, width: 0, height: 0, area: 0 });
    const [params, setParams] = useState({
        coats: 2,
        coverage: 10, // m2/L
        margin: 10, // %
        containerSize: 10, // L for paint
    });
    const [result, setResult] = useState(null);

    useEffect(() => {
        calculate();
    }, [dimensions, params, mode]);

    const calculate = () => {
        let area = dimensions.area;
        if (dimensions.length > 0 && dimensions.width > 0) {
            area = dimensions.length * dimensions.width;
            // Wall mode?
            if (mode === 'paint' && dimensions.height > 0) {
                // Simple box calculation: (L+W)*2 * H
                // But let's keep it simple: User inputs surface or L x W for floor/ceiling/wall section
            }
        }

        let calculated = 0;
        let details = "";

        if (mode === 'paint') {
            const totalSurface = area * params.coats;
            const litersNeeded = totalSurface / params.coverage;
            const buckets = Math.ceil(litersNeeded / params.containerSize);
            calculated = buckets; // Returning buckets count? Or Liters? Let's return Liters or Quantity of items.
            details = `${totalSurface.toFixed(1)}m² à couvrir (${params.coats} couches). Besoin de ${litersNeeded.toFixed(1)}L.`;
            // Make 'calculated' the quantity to insert into the quote line (e.g. buckets or liters)
            // Let's assume user sells by the pot/bucket mostly, or by m2.
            // If selling by m2 (Labor), just return the area.
            // If selling supplies, return the volume.

        } else if (mode === 'tiling' || mode === 'flooring') {
            const wasteFactor = 1 + (params.margin / 100);
            const totalArea = area * wasteFactor;
            calculated = Math.ceil(totalArea * 100) / 100; // Round to 2 decimals
            details = `${area}m² + ${params.margin}% de chutes = ${calculated.toFixed(2)}m² à commander.`;
        }

        setResult({ quantity: calculated, details, rawArea: area });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center">
                        <Calculator className="w-5 h-5 mr-2 text-blue-600" />
                        Calculatrice Matériaux
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Tabs */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => { setMode('paint'); setDimensions({ ...dimensions, height: 0 }); }}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'paint' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Peinture
                        </button>
                        <button
                            onClick={() => setMode('tiling')}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'tiling' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Carrelage / Sol
                        </button>
                    </div>

                    {/* Inputs */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Longueur (m)</label>
                            <input
                                type="number"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                value={dimensions.length || ''}
                                onChange={e => setDimensions({ ...dimensions, length: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Largeur (m)</label>
                            <input
                                type="number"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                value={dimensions.width || ''}
                                onChange={e => setDimensions({ ...dimensions, width: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                    </div>

                    {/* Specific Params */}
                    {mode === 'paint' && (
                        <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 rounded-lg">
                            <div>
                                <label className="block text-xs font-medium text-blue-800 mb-1">Couches</label>
                                <select
                                    className="w-full px-2 py-1 border border-blue-200 rounded"
                                    value={params.coats}
                                    onChange={e => setParams({ ...params, coats: parseInt(e.target.value) })}
                                >
                                    <option value="1">1 couche</option>
                                    <option value="2">2 couches</option>
                                    <option value="3">3 couches</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-blue-800 mb-1">Rendement (m²/L)</label>
                                <input
                                    type="number"
                                    className="w-full px-2 py-1 border border-blue-200 rounded"
                                    value={params.coverage}
                                    onChange={e => setParams({ ...params, coverage: parseFloat(e.target.value) || 10 })}
                                />
                            </div>
                        </div>
                    )}

                    {mode === 'tiling' && (
                        <div className="grid grid-cols-2 gap-4 p-3 bg-green-50 rounded-lg">
                            <div>
                                <label className="block text-xs font-medium text-green-800 mb-1">Marge de sécurité (Chutes)</label>
                                <select
                                    className="w-full px-2 py-1 border border-green-200 rounded"
                                    value={params.margin}
                                    onChange={e => setParams({ ...params, margin: parseInt(e.target.value) })}
                                >
                                    <option value="0">0%</option>
                                    <option value="5">5% (Simple)</option>
                                    <option value="10">10% (Pose droite)</option>
                                    <option value="15">15% (Diagonale)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {result && (
                        <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                            <p className="text-sm font-medium text-gray-700">Résultat estimé :</p>
                            <p className="text-2xl font-bold text-gray-900 my-1">
                                {result.quantity} {mode === 'paint' ? 'L' : 'm²'}
                            </p>
                            <p className="text-xs text-gray-500">{result.details}</p>
                        </div>
                    )}

                    <button
                        onClick={() => onApply && onApply(result.quantity)}
                        className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        Appliquer cette quantité
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MaterialsCalculator;
