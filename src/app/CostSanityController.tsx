import { useEffect } from 'react';
import './costSanity.css';

function ensureNote() {
  const section = document.getElementById('deployment');
  if (!section || section.querySelector('.cost-sanity-note')) return;
  const title = section.querySelector('.section-title');
  if (!title) return;

  const note = document.createElement('div');
  note.className = 'cost-sanity-note';
  note.innerHTML = '<b>COME LEGGERE I COSTI</b><span>On-prem e colocation mostrano un <strong>costo equivalente mensile</strong>: include la quota di ammortamento dell’hardware, quindi non è una fattura mensile reale. Il TCO a 4 anni conta il CAPEX una sola volta e aggiunge energia, cooling, manutenzione e servizi.</span>';
  title.insertAdjacentElement('afterend', note);
}

export default function CostSanityController() {
  useEffect(() => {
    ensureNote();
    const observer = new MutationObserver(ensureNote);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
