import { useEffect, useState, useRef } from 'react';
import { useDebounce } from './useDebounce';
import { toast } from 'sonner';

/**
 * Hook to auto-save state to localStorage
 * @param {string} key - LocalStorage key
 * @param {any} data - State to save
 * @param {boolean} enabled - Whether saving is enabled
 * @param {number} delay - Debounce delay in ms
 */
export const useAutoSave = (key, data, enabled = true, delay = 1000) => {
    const debouncedData = useDebounce(data, delay);
    const [lastSaved, setLastSaved] = useState(null);
    const enabledRef = useRef(enabled);
    // Track previous key to avoid saving stale data when navigating between documents.
    // When key changes (e.g. redirect to newly created invoice), the debounced data still
    // holds the previous document's content. Saving it under the new key would corrupt
    // the new document's draft and break deduction items on the next load.
    const prevKeyRef = useRef(key);

    // Keep ref in sync so the effect always reads the latest value
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        // When key changes, skip this save cycle to avoid writing stale (previous document)
        // data under the new document's draft key.
        if (prevKeyRef.current !== key) {
            prevKeyRef.current = key;
            return;
        }

        // Use ref instead of dependency to avoid saving stale debounced data
        // when enabled transitions from false to true (before debounce settles)
        if (!enabledRef.current || !key || !debouncedData) return;

        try {
            // Add a timestamp metadata
            const dataToSave = {
                ...debouncedData,
                _draft_saved_at: new Date().toISOString()
            };

            localStorage.setItem(key, JSON.stringify(dataToSave));
            setLastSaved(new Date());

            // Optional: minimal feedback? No, too noisy.
        } catch (error) {
            console.error('Auto-save error:', error);
        }
    }, [debouncedData, key]);

    const clearAutoSave = () => {
        if (key) {
            localStorage.removeItem(key);
            setLastSaved(null);
        }
    };

    return { lastSaved, clearAutoSave };
};

/**
 * Helper to retrieve draft
 */
export const getDraft = (key) => {
    if (!key) return null;
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        return null;
    }
};
