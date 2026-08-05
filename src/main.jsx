// App entry point: mounts the React app into the #root div in index.html.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode double-invokes effects in development to surface bugs.
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
