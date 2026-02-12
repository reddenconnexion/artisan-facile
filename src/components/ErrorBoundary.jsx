import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, recovering: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleReload = async () => {
        this.setState({ recovering: true });
        try {
            // 1. Désinscrire le Service Worker
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(r => r.unregister()));
            }
            // 2. Vider tous les caches
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(key => caches.delete(key)));
            }
        } catch (e) {
            console.error('Error during cache cleanup:', e);
        }
        // 3. Recharger sans cache navigateur
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '28rem', width: '100%', textAlign: 'center' }}>
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>!</span>
                        </div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
                            Une erreur est survenue
                        </h1>
                        <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                            La page n'a pas pu se charger correctement.
                        </p>
                        <button
                            onClick={this.handleReload}
                            disabled={this.state.recovering}
                            style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', fontWeight: '500', cursor: 'pointer', fontSize: '0.875rem', opacity: this.state.recovering ? 0.7 : 1 }}
                        >
                            {this.state.recovering ? 'Nettoyage du cache...' : 'Recharger la page'}
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
