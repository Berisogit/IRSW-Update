
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';

const initApp = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error("Critical Failure: Mount target '#root' not found in DOM.");
    return;
  }

  const root = ReactDOM.createRoot(rootElement);
  // Removed StrictMode to prevent reconciliation errors (like removeChild) 
  // that occur in specific sandbox/origin-restricted environments.
  root.render(
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  );

  /**
   * Service Worker Registration with Enhanced Sandbox & Origin Protection
   */
  if ('serviceWorker' in navigator) {
    const isSecure = window.isSecureContext;
    const hasValidOrigin = window.location.origin !== 'null' && !!window.location.host;

    if (isSecure && hasValidOrigin) {
      window.addEventListener('load', () => {
        const swPath = './sw.js';
        
        navigator.serviceWorker.register(swPath, { scope: './' })
          .then(registration => {
            console.debug('IRSW Service Worker active. Scope:', registration.scope);
          })
          .catch((e: unknown) => {
            const errorMessage = e instanceof Error ? e.message : String(e);
            const errorName = e instanceof Error ? e.name : 'UnknownError';

            if (errorName === 'SecurityError' || errorMessage.includes('origin') || errorMessage.includes('cross-origin')) {
              console.debug('IRSW Service Worker skipped: Environment restriction or origin mismatch.');
            } else {
              console.warn('IRSW Service Worker registration failed:', errorMessage);
            }
          });
      });
    } else {
      console.debug('IRSW Service Worker bypassed: Insecure context or restricted sandbox detected.');
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
