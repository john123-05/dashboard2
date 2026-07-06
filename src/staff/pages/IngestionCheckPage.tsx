
import { FormEvent, useState } from 'react';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';

interface PreviewData {
  prefix: string | null;
  filename: string;
  customerCode: string | null;
  legacyCustomerCode: string | null;
  timeCode: string | null;
  fileCode: string | null;
  speedKmh: number | null;
  matchedParkId: string | null;
  matchedParkName: string | null;
  matchedCustomerCode: string | null;
  matchedAttractionId: string | null;
  matchedAttractionName: string | null;
}

export default function IngestionCheckPage() {
  const [path, setPath] = useState('plose-plosebob/1963186224002020.jpg');
  const [result, setResult] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const res = await edgeFetch(`/api/admin/preview-parse?path=${encodeURIComponent(path)}`);

    const body = await res.json();
    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Preview fehlgeschlagen'));
      setResult(null);
      return;
    }

    setResult(body.data as PreviewData);
  };

  return (
    <div className="grid">
      <div className="card">
        <h2>Ingestion Check</h2>
        <p className="note">Prüft Prefix-Routing + Code-Parsing + Attraction-Mapping.</p>
        <form className="grid" onSubmit={runPreview}>
          <div>
            <label>Storage Path</label>
            <input value={path} onChange={(e) => setPath(e.target.value)} required />
          </div>
          <button type="submit">Prüfen</button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="card">
          <h3>Ergebnis</h3>
          <table className="table">
            <tbody>
              <tr><th>Prefix</th><td>{result.prefix || '-'}</td></tr>
              <tr><th>Filename</th><td>{result.filename}</td></tr>
              <tr><th>Customer Code</th><td>{result.customerCode || '-'}</td></tr>
              <tr><th>Legacy Code (erste 4)</th><td>{result.legacyCustomerCode || '-'}</td></tr>
              <tr><th>Time Code</th><td>{result.timeCode || '-'}</td></tr>
              <tr><th>File Code</th><td>{result.fileCode || '-'}</td></tr>
              <tr><th>Speed km/h</th><td>{result.speedKmh ?? '-'}</td></tr>
              <tr><th>Park</th><td>{result.matchedParkName || '-'} {result.matchedParkId ? `(${result.matchedParkId})` : ''}</td></tr>
              <tr><th>Matched Customer Code</th><td>{result.matchedCustomerCode || '-'}</td></tr>
              <tr><th>Attraktion</th><td>{result.matchedAttractionName || '-'} {result.matchedAttractionId ? `(${result.matchedAttractionId})` : ''}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
