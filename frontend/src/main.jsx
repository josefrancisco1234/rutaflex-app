import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App'
import { initCloud } from './store/cloud'

createRoot(document.getElementById('root')).render(<App />)
initCloud()
