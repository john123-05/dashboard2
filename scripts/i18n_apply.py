"""Neue Übersetzungsschlüssel in alle 7 Sprachblöcke von src/lib/i18n.tsx eintragen
und feste Texte in Dateien ersetzen.

Benutzung (aus dem Repo-Root, z. B. in einem kurzen Python-Skript):

    import sys; sys.path.insert(0, 'scripts')
    from i18n_apply import apply
    apply(
        {'bereich.schluessel': ['Deutsch', 'English', 'Español', 'Français', 'Italiano', 'Nederlands', 'Latviešu']},
        [('src/pages/Datei.tsx', '>Fester Text<', ">{t('bereich.schluessel')}<")],
    )

Reihenfolge der Sprachen: de, en, es, fr, it, nl, lv. Vorhandene Schlüssel werden
nicht überschrieben. Danach immer `npm run check:i18n` und `npm run typecheck`.
"""
import json, re, sys
LANGS=['de','en','es','fr','it','nl','lv']
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def apply(keys, replacements, root=ROOT):
    """keys: {key: [de,en,es,fr,it,nl,lv]}; replacements: [(relpath, old, new)]"""
    p=root+'/src/lib/i18n.tsx'
    s=open(p).read()
    # block boundaries
    starts={l:s.index("\n  %s: {"%l) for l in LANGS}
    order=sorted(LANGS,key=lambda l:starts[l])
    # find end of each block: start of next block, or "\n};" for last
    ends={}
    for i,l in enumerate(order):
        ends[l]=starts[order[i+1]] if i+1<len(order) else s.index("\n};",starts[l])
    # insert from last to first so indexes stay valid
    for l in sorted(LANGS,key=lambda l:-ends[l]):
        idx=LANGS.index(l)
        block=s[starts[l]:ends[l]]
        add=''
        for k,v in keys.items():
            if "'%s':"%k in block or '"%s":'%k in block:
                continue
            add+="    '%s': %s,\n"%(k,json.dumps(v[idx],ensure_ascii=False))
        e=ends[l]
        # insert before the closing "  }," that precedes ends[l]
        close=s.rindex("  },",starts[l],e)
        s=s[:close]+add+s[close:]
    open(p,'w').write(s)
    for rel,old,new in replacements:
        fp=root+'/'+rel
        t=open(fp).read()
        if old not in t:
            print('NOT FOUND',rel,old[:60]); continue
        t=t.replace(old,new)
        open(fp,'w').write(t)
    print('ok',len(keys),'keys',len(replacements),'replacements')
