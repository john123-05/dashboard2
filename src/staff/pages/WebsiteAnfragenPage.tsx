import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import { appendActivityEvent } from '../lib/activity-feed';

type WebsiteRequestRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  country: string;
  project_type: string;
  referral_source: string;
  message: string;
  submitted_at: string;
  source: string;
  user_agent: string;
  url: string;
};

type EmailLeadRow = {
  id: string;
  email: string;
  name: string;
  firma: string;
  attractionstyp: string;
  frage: string;
  antwort: string;
  spalte_1: string;
  submitted_at: string;
};

type WebsiteImportRow = {
  name: string;
  email: string;
  company: string;
  country: string;
  project_type: string;
  referral_source: string;
  message: string;
  timestamp: string;
  source: string;
  useragent: string;
  url: string;
};

type LeadImportRow = {
  email: string;
  name: string;
  firma: string;
  attractionstyp: string;
  frage: string;
  antwort: string;
  spalte1: string;
  timestamp: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-]+/g, '');
}

function detectDelimiter(input: string): ',' | ';' | '\t' {
  const firstLine = input.split(/\r?\n/)[0] || '';
  const candidates: Array<',' | ';' | '\t'> = [',', ';', '\t'];
  const scored = candidates
    .map((delimiter) => ({ delimiter, score: firstLine.split(delimiter).length }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.delimiter || ',';
}

function parseCsv(text: string, delimiter: ',' | ';' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length > 0 && rows[0].length > 0) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  }

  return rows;
}

function mapWebsiteCsvRows(rawRows: string[][]): WebsiteImportRow[] {
  if (!rawRows.length) return [];

  const headers = rawRows[0].map((header) => normalizeHeader(header));
  const getIndex = (names: string[]) => headers.findIndex((header) => names.includes(header));

  const nameIndex = getIndex(['name']);
  const emailIndex = getIndex(['email', 'e-mail', 'mail']);
  const companyIndex = getIndex(['company', 'firma']);
  const countryIndex = getIndex(['country', 'land']);
  const projectTypeIndex = getIndex(['projecttype', 'project']);
  const referralSourceIndex = getIndex(['referralsource', 'referral', 'sourcechannel']);
  const messageIndex = getIndex(['message', 'nachricht']);
  const timestampIndex = getIndex(['timestamp', 'time', 'createdat', 'date']);
  const sourceIndex = getIndex(['source']);
  const userAgentIndex = getIndex(['useragent', 'ua']);
  const urlIndex = getIndex(['url', 'website']);

  const get = (row: string[], index: number) => (index >= 0 ? (row[index] || '').trim() : '');

  return rawRows
    .slice(1)
    .map((row) => ({
      name: get(row, nameIndex),
      email: get(row, emailIndex),
      company: get(row, companyIndex),
      country: get(row, countryIndex),
      project_type: get(row, projectTypeIndex),
      referral_source: get(row, referralSourceIndex),
      message: get(row, messageIndex),
      timestamp: get(row, timestampIndex),
      source: get(row, sourceIndex),
      useragent: get(row, userAgentIndex),
      url: get(row, urlIndex),
    }))
    .filter((row) => Object.values(row).some(Boolean));
}

function mapLeadCsvRows(rawRows: string[][]): LeadImportRow[] {
  if (!rawRows.length) return [];

  const headers = rawRows[0].map((header) => normalizeHeader(header));
  const getIndex = (names: string[]) => headers.findIndex((header) => names.includes(header));

  const emailIndex = getIndex(['email', 'e-mail', 'mail']);
  const nameIndex = getIndex(['name']);
  const firmaIndex = getIndex(['firma', 'company']);
  const attractionstypIndex = getIndex(['attractionstyp', 'attractiontype', 'attraction']);
  const frageIndex = getIndex(['frage', 'question']);
  const antwortIndex = getIndex(['antwort', 'answer']);
  const spalte1Index = getIndex(['spalte1', 'spalte']);
  const timestampIndex = getIndex(['timestamp', 'time', 'createdat', 'date']);

  const get = (row: string[], index: number) => (index >= 0 ? (row[index] || '').trim() : '');

  return rawRows
    .slice(1)
    .map((row) => ({
      email: get(row, emailIndex),
      name: get(row, nameIndex),
      firma: get(row, firmaIndex),
      attractionstyp: get(row, attractionstypIndex),
      frage: get(row, frageIndex),
      antwort: get(row, antwortIndex),
      spalte1: get(row, spalte1Index),
      timestamp: get(row, timestampIndex),
    }))
    .filter((row) => Object.values(row).some(Boolean));
}

export default function WebsiteAnfragenPage() {
  const [websiteRows, setWebsiteRows] = useState<WebsiteRequestRow[]>([]);
  const [websiteLoading, setWebsiteLoading] = useState(true);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [websiteStatus, setWebsiteStatus] = useState<string | null>(null);
  const [pendingWebsiteRows, setPendingWebsiteRows] = useState<WebsiteImportRow[]>([]);
  const [websiteImporting, setWebsiteImporting] = useState(false);
  const [websiteFileName, setWebsiteFileName] = useState('');

  const [leadRows, setLeadRows] = useState<EmailLeadRow[]>([]);
  const [leadLoading, setLeadLoading] = useState(true);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [pendingLeadRows, setPendingLeadRows] = useState<LeadImportRow[]>([]);
  const [leadImporting, setLeadImporting] = useState(false);
  const [leadFileName, setLeadFileName] = useState('');

  const loadWebsiteRows = useCallback(async () => {
    setWebsiteLoading(true);
    setWebsiteError(null);

    const res = await edgeFetch('/api/admin/website-requests?limit=1000', { method: 'GET' });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setWebsiteError(getApiErrorMessage(body, 'Website-Anfragen konnten nicht geladen werden'));
      setWebsiteLoading(false);
      return;
    }

    const data = Array.isArray((body as { data?: unknown[] })?.data)
      ? ((body as { data: WebsiteRequestRow[] }).data || [])
      : [];

    setWebsiteRows(data);
    setWebsiteLoading(false);
  }, []);

  const loadLeadRows = useCallback(async () => {
    setLeadLoading(true);
    setLeadError(null);

    const res = await edgeFetch('/api/admin/email-leads?limit=1000', { method: 'GET' });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setLeadError(getApiErrorMessage(body, 'Email-Leads konnten nicht geladen werden'));
      setLeadLoading(false);
      return;
    }

    const data = Array.isArray((body as { data?: unknown[] })?.data)
      ? ((body as { data: EmailLeadRow[] }).data || [])
      : [];

    setLeadRows(data);
    setLeadLoading(false);
  }, []);

  useEffect(() => {
    void loadWebsiteRows();
    void loadLeadRows();
  }, [loadLeadRows, loadWebsiteRows]);

  const onWebsiteFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setWebsiteError(null);
    setWebsiteStatus(null);

    const file = e.target.files?.[0];
    if (!file) {
      setPendingWebsiteRows([]);
      setWebsiteFileName('');
      return;
    }

    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const parsedRows = parseCsv(text, delimiter);
    const mappedRows = mapWebsiteCsvRows(parsedRows);

    if (!mappedRows.length) {
      setWebsiteError('Keine gueltigen CSV-Zeilen gefunden. Bitte Header pruefen.');
      setPendingWebsiteRows([]);
      setWebsiteFileName(file.name);
      return;
    }

    setPendingWebsiteRows(mappedRows);
    setWebsiteFileName(file.name);
    setWebsiteStatus(`${mappedRows.length} Zeilen bereit fuer Import`);
  };

  const onLeadFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setLeadError(null);
    setLeadStatus(null);

    const file = e.target.files?.[0];
    if (!file) {
      setPendingLeadRows([]);
      setLeadFileName('');
      return;
    }

    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const parsedRows = parseCsv(text, delimiter);
    const mappedRows = mapLeadCsvRows(parsedRows);

    if (!mappedRows.length) {
      setLeadError('Keine gueltigen CSV-Zeilen gefunden. Bitte Header pruefen.');
      setPendingLeadRows([]);
      setLeadFileName(file.name);
      return;
    }

    setPendingLeadRows(mappedRows);
    setLeadFileName(file.name);
    setLeadStatus(`${mappedRows.length} Zeilen bereit fuer Import`);
  };

  const onWebsiteImport = async () => {
    if (!pendingWebsiteRows.length) return;

    setWebsiteImporting(true);
    setWebsiteError(null);
    setWebsiteStatus(null);

    try {
      const res = await edgeFetch('/api/admin/website-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pendingWebsiteRows }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setWebsiteError(getApiErrorMessage(body, 'CSV-Import fehlgeschlagen'));
        return;
      }

      setWebsiteStatus(`${pendingWebsiteRows.length} Zeilen importiert`);
      appendActivityEvent({
        title: 'Website-Anfragen importiert',
        details: `${pendingWebsiteRows.length} Zeilen aus ${websiteFileName || 'CSV'}`,
        level: 'success',
      });
      setPendingWebsiteRows([]);
      setWebsiteFileName('');
      await loadWebsiteRows();
    } finally {
      setWebsiteImporting(false);
    }
  };

  const onLeadImport = async () => {
    if (!pendingLeadRows.length) return;

    setLeadImporting(true);
    setLeadError(null);
    setLeadStatus(null);

    try {
      const res = await edgeFetch('/api/admin/email-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pendingLeadRows }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setLeadError(getApiErrorMessage(body, 'CSV-Import fehlgeschlagen'));
        return;
      }

      setLeadStatus(`${pendingLeadRows.length} Zeilen importiert`);
      appendActivityEvent({
        title: 'Email-Leads importiert',
        details: `${pendingLeadRows.length} Zeilen aus ${leadFileName || 'CSV'}`,
        level: 'success',
      });
      setPendingLeadRows([]);
      setLeadFileName('');
      await loadLeadRows();
    } finally {
      setLeadImporting(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Website Anfragen</h2>
        <p className="note">CSV importieren und persistent in der Datenbank speichern.</p>

        <div className="upload-row">
          <div className="upload-file-col">
            <label>CSV Datei</label>
            <input type="file" accept=".csv,text/csv" onChange={onWebsiteFileChange} />
          </div>
          <div className="upload-btn-col">
            <button type="button" onClick={onWebsiteImport} disabled={!pendingWebsiteRows.length || websiteImporting}>
              {websiteImporting ? 'Import laeuft...' : 'CSV importieren'}
            </button>
          </div>
        </div>

        {websiteFileName && <p className="note">Datei: {websiteFileName}</p>}
        {pendingWebsiteRows.length > 0 && <p className="note">Bereit: {pendingWebsiteRows.length} Zeilen</p>}
        {websiteStatus && <p className="success">{websiteStatus}</p>}
        {websiteError && <p className="error">{websiteError}</p>}
      </div>

      <div className="card">
        <h3>Tabelle: Website Anfragen</h3>
        <div className="table-wrap widget-scroll-x">
          <table className="table website-data-table">
            <thead>
              <tr>
                <th>name</th>
                <th>email</th>
                <th>company</th>
                <th>country</th>
                <th>project type</th>
                <th>referralsource</th>
                <th>message</th>
                <th>timestamp</th>
                <th>source</th>
                <th>useragent</th>
                <th>url</th>
              </tr>
            </thead>
            <tbody>
              {websiteLoading && (
                <tr>
                  <td colSpan={11} className="note">Lade Daten...</td>
                </tr>
              )}

              {!websiteLoading && websiteRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="note">Noch keine Eintraege.</td>
                </tr>
              )}

              {!websiteLoading &&
                websiteRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name || '-'}</td>
                    <td>{row.email || '-'}</td>
                    <td>{row.company || '-'}</td>
                    <td>{row.country || '-'}</td>
                    <td>{row.project_type || '-'}</td>
                    <td>{row.referral_source || '-'}</td>
                    <td>{row.message || '-'}</td>
                    <td>{formatDateTime(row.submitted_at)}</td>
                    <td>{row.source || '-'}</td>
                    <td>{row.user_agent || '-'}</td>
                    <td>{row.url || '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Tabelle: Email Leads</h3>
        <p className="note">Spalten wie im Sheet: email, name, firma, attractionstyp, frage, antwort, Spalte 1.</p>

        <div className="upload-row">
          <div className="upload-file-col">
            <label>CSV Datei</label>
            <input type="file" accept=".csv,text/csv" onChange={onLeadFileChange} />
          </div>
          <div className="upload-btn-col">
            <button type="button" onClick={onLeadImport} disabled={!pendingLeadRows.length || leadImporting}>
              {leadImporting ? 'Import laeuft...' : 'CSV importieren'}
            </button>
          </div>
        </div>

        {leadFileName && <p className="note">Datei: {leadFileName}</p>}
        {pendingLeadRows.length > 0 && <p className="note">Bereit: {pendingLeadRows.length} Zeilen</p>}
        {leadStatus && <p className="success">{leadStatus}</p>}
        {leadError && <p className="error">{leadError}</p>}

        <div className="table-wrap widget-scroll-x" style={{ marginTop: 10 }}>
          <table className="table leads-data-table">
            <thead>
              <tr>
                <th>email</th>
                <th>name</th>
                <th>firma</th>
                <th>attractionstyp</th>
                <th>frage</th>
                <th>antwort</th>
                <th>Spalte 1</th>
              </tr>
            </thead>
            <tbody>
              {leadLoading && (
                <tr>
                  <td colSpan={7} className="note">Lade Daten...</td>
                </tr>
              )}
              {!leadLoading && leadRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="note">Noch keine Eintraege.</td>
                </tr>
              )}
              {!leadLoading &&
                leadRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.email || '-'}</td>
                    <td>{row.name || '-'}</td>
                    <td>{row.firma || '-'}</td>
                    <td>{row.attractionstyp || '-'}</td>
                    <td>{row.frage || '-'}</td>
                    <td>{row.antwort || '-'}</td>
                    <td>{row.spalte_1 || '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
