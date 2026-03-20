import React from 'react';
import { Wrench } from 'lucide-react';

const Outils = () => {
    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            <div className="px-4 mb-3 shrink-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Wrench className="w-8 h-8 text-yellow-500" />
                    Outils
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Outils métier intégrés.</p>
            </div>

            <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 mx-4 mb-4">
                <iframe
                    src="/plan-electrique.html"
                    title="Plan électrique"
                    className="w-full h-full border-0"
                    allow="clipboard-write"
                />
            </div>
        </div>
    );
};

export default Outils;
