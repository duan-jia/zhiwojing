import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MapDemo} from './MapDemo';
import './map-demo.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MapDemo/>
  </StrictMode>,
);
