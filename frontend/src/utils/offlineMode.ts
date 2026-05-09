import { useState, useEffect } from 'react';

const OFFLINE_MODE_KEY = 'fieldpro:offlineMode';

/**
 * Hook to manage offline mode state with persistence.
 * 
 * Offline mode is activated when:
 * - navigator.onLine === false
 * - Manual override is enabled
 * 
 * Once offline mode is activated, it stays active until explicitly cleared
 * to prevent flapping between online/offline states.
 */
export function useOfflineMode() {
    const [offlineMode, setOfflineModeState] = useState<boolean>(() => {
        // Initialize from localStorage
        try {
            return localStorage.getItem(OFFLINE_MODE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    const [manualOverride, setManualOverride] = useState<boolean>(false);

    useEffect(() => {
        const handleOffline = () => {
            // Auto-activate offline mode when browser goes offline
            setOfflineModeState(true);
            try {
                localStorage.setItem(OFFLINE_MODE_KEY, 'true');
            } catch {
                // Ignore storage errors
            }
        };

        const handleOnline = () => {
            // Do NOT auto-clear offline mode when browser comes online
            // User must manually clear it to prevent flapping
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);

        // Check initial state
        if (!navigator.onLine && !offlineMode) {
            handleOffline();
        }

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, [offlineMode]);

    const setOfflineMode = (enabled: boolean) => {
        setOfflineModeState(enabled);
        setManualOverride(enabled);
        try {
            if (enabled) {
                localStorage.setItem(OFFLINE_MODE_KEY, 'true');
            } else {
                localStorage.removeItem(OFFLINE_MODE_KEY);
            }
        } catch {
            // Ignore storage errors
        }
    };

    const clearOfflineMode = () => {
        setOfflineModeState(false);
        setManualOverride(false);
        try {
            localStorage.removeItem(OFFLINE_MODE_KEY);
        } catch {
            // Ignore storage errors
        }
    };

    return {
        offlineMode,
        manualOverride,
        isOnline: navigator.onLine,
        setOfflineMode,
        clearOfflineMode,
    };
}
