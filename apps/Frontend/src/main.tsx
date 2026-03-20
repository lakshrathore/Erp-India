import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/ui/toast'
import { useAuthStore } from './stores/auth.store'
import './index.css'

// ─── Wait for Zustand persist to rehydrate from localStorage ─────────────────
// Without this, on page refresh the store starts empty and API calls
// go out without x-company-id header, causing 401 errors.

async function prepare() {
  // Zustand persist exposes a rehydrate method via onRehydrateStorage
  // We wait for it to complete before rendering the app
  await new Promise<void>((resolve) => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      unsub()
      resolve()
    })
    // If already hydrated (e.g. in dev), resolve immediately
    if (useAuthStore.persist.hasHydrated()) {
      resolve()
    }
  })
}

prepare().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </React.StrictMode>
  )
})
