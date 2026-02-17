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

    // Keep ref in sync so the effect always reads the latest value
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
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
