import React from 'react'
import ReactDOM from 'react-dom/client'
import { installMockAPI } from '../shared/mockAPI'
import App from './App'
import './styles/freeze.css'

if (!window.focusAPI) installMockAPI()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
