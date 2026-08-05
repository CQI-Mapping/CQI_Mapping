// App entry point: mounts the React app into the #root div in index.html.
// If the Supabase keys were not inlined at build time (e.g. env vars missing on
// Vercel), we render a readable setup screen instead of silently going white.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { supabaseConfigured } from './utils/supabaseClient'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))

if (!supabaseConfigured) {
  root.render(
    <div className="config-error">
      <div className="config-error__card">
        <h1>Supabase is not configured</h1>
        <p>
          This build was made without the Supabase keys, so the app cannot start.
        </p>
        <p>
          In Vercel → Project → <strong>Settings → Environment Variables</strong>, add{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> for{' '}
          <strong>Production</strong>, then redeploy.
        </p>
      </div>
    </div>
  )
} else {
  // StrictMode double-invokes effects in development to surface bugs.
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
