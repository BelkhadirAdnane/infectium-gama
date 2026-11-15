import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// L'écran de démarrage s'efface dès le premier rendu de l'interface.
requestAnimationFrame(() => {
  (window as any).__hideBoot?.();
});
