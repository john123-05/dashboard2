"""Neue Übersetzungsschlüssel in alle 7 Sprachdateien (src/lib/locales/<sprache>.ts) eintragen
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
    # Jede Sprache hat eine eigene Datei: src/lib/locales/<sprache>.ts (ein Objekt `dict`, endet mit "};").
    for idx,l in enumerate(LANGS):
        p=root+'/src/lib/locales/%s.ts'%l
        s=open(p).read()
        add=''
        for k,v in keys.items():
            if "'%s':"%k in s or '"%s":'%k in s:
                continue
            add+="    '%s': %s,\n"%(k,json.dumps(v[idx],ensure_ascii=False))
        close=s.rindex("};")
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
