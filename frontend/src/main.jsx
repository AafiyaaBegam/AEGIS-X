import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './live.css'
import './overview-command.css'
import './aegis-premium.css'
import './command-center-v3.css'
import './aegis-command-v4.css'
import './aegis-theme-v6.css'
import './aegis-v7-overhaul.css'
import './aegis-v8-refinement.css'
import './aegis-v10-object.css'
import './aegis-v13-radiance.css'
import './aegis-v14-readability.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
