import { useEffect, useState, useCallback } from 'react';

/**
 * Cap how many items from a list are rendered at once. Items beyond the
 * current window are not in the DOM, keeping render fast for very large
 * lists (1k+) without pulling in a virtualisation library. Resets to the
 * initial page size whenever the list identity or length changes
 * (e.g. when the user changes the search query).
 *
 * @param {Array} items - Source array (already filtered/sorted)
 * @param {Object} [options]
 * @param {number} [options.pageSize=100]
 * @returns {{ visibleItems: Array, hasMore: boolean, hiddenCount: number, loadMore: () => void, showAll: () => void }}
 */
export const useProgressiveList = (items, { pageSize = 100 } = {}) => {
    const [count, setCount] = useState(pageSize);
    const total = items.length;

    // Reset paging when the filter result shrinks (e.g. user typed a search term),
    // but keep the user's "load more" state when items only grow (background sync).
    useEffect(() => {
        setCount((prev) => Math.min(prev, Math.max(pageSize, total)) || pageSize);
    }, [total, pageSize]);

    const loadMore = useCallback(() => {
        setCount((c) => c + pageSize);
    }, [pageSize]);

    const showAll = useCallback(() => {
        setCount(total);
    }, [total]);

    const visibleItems = count >= total ? items : items.slice(0, count);
    const hasMore = count < total;
    const hiddenCount = Math.max(0, total - count);

    return { visibleItems, hasMore, hiddenCount, loadMore, showAll };
};
