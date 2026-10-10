"""Ein-Datei-Fassungen für den Supabase-Editor erzeugen (supabase/dashboard-paste/<name>.ts).

Benutzung: python3 scripts/build-paste.py operator-survey ...  (bei Namenskonflikten: --wrap, z. B. external-leads)
Inhalt = Header + createClient-Import + _shared/sameProjectAdminAuth.ts + _shared/operatorAuth.ts
(+ weitere _shared-Dateien, die die Function importiert) + index.ts, jeweils ohne `import`-Zeilen
aus dem Repo. Danach immer: deno check supabase/dashboard-paste/<name>.ts
"""
import re, sys, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FN = ROOT + '/supabase/functions/'
EXTERNAL_IMPORT = re.compile(r"^import\s+(?:[^;]*?\s+from\s+)?[\"'](?!\.\.?/)[^\"']+[\"'];?\n", re.M)
LOCAL_IMPORT = re.compile(r"^import\s+[^;]*?from\s+[\"']\.\.?/[^\"']+[\"'];?\n", re.M)


def strip_local(src):
    return LOCAL_IMPORT.sub('', src)


def build(name, wrap=False):
    index = open(FN + name + '/index.ts').read()
    shared = []
    for rel in re.findall(r"from\s+[\"']\.\./_shared/([A-Za-z]+)\.ts[\"']", index):
        if rel not in ('sameProjectAdminAuth', 'operatorAuth') and rel not in shared:
            shared.append(rel)
    parts = ['sameProjectAdminAuth', 'operatorAuth'] + shared
    externals = []
    body = ''
    for part in parts:
        src = open(FN + '_shared/' + part + '.ts').read()
        for m in EXTERNAL_IMPORT.findall(src):
            if m not in externals:
                externals.append(m)
        body += strip_local(EXTERNAL_IMPORT.sub('', src)) + '\n'
    for m in EXTERNAL_IMPORT.findall(index):
        if m not in externals:
            externals.append(m)
    own = strip_local(EXTERNAL_IMPORT.sub('', index))
    # --wrap: eigene Namen der Function (z. B. corsHeaders) in einem Block kapseln, falls sie mit _shared kollidieren.
    body += ('{\n' + own + '\n}\n') if wrap else own
    head = (
        '// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.\n'
        f'// Quelle im Repo: supabase/functions/{name}/index.ts (erzeugt mit scripts/build-paste.py)\n\n'
    )
    out = head + ''.join(externals) + '\n' + body
    open(ROOT + '/supabase/dashboard-paste/' + name + '.ts', 'w').write(out)
    print('geschrieben:', name)


for n in sys.argv[1:]:
    if n.startswith('--'):
        continue
    build(n, wrap='--wrap' in sys.argv)
