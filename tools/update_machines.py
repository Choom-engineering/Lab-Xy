"""Bring LAB_XY's machines up to date with the Open-XY catalog.

    python tools/update_machines.py --sdk path/to/open-xy [--summary summary.md]

For every published synth and drum kit in the catalog that LAB_XY does not have
yet, or has at another version (tag), this clones the machine's repository at
that tag, builds its browser preview with the Open-XY SDK (Clang with wasm32
and wasm-ld), and installs it in machines/<id>/. LAB_XY's own machines
(Champagne, Babel, Flux…) are left as they are. It also refreshes the SDK's
browser modules in sdk/browser/.

When anything changed it regenerates machines/index.json, CREDITS.md and the
classic-script files (tools/build.py), raises the version so visitors get the
new files, and writes a summary of what it did. The weekly GitHub Action
(.github/workflows/update-machines.yml) runs it and opens a pull request.
Exit status: 0 in every case but an error; "changed=true|false" goes to
$GITHUB_OUTPUT when it is set.
"""
import argparse, json, os, pathlib, re, shutil, subprocess, sys, tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from drum_keys import drum_keys

SITE = pathlib.Path(__file__).resolve().parent.parent
MACHINES = SITE / 'machines'
# Not distributed here: hurdygurdy's permission covers the Open-XY catalog and
# firmware only; omnifilter is a filter for the whole instrument, not a sound.
EXCLUDE = {'hurdygurdy', 'omnifilter'}
KINDS = {'synth', 'drum'}
SDK_MODULES = ['engine.mjs', 'controls.mjs', 'display.mjs', 'graphics.mjs']


def run(cmd, cwd=None, timeout=900):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def first_line(path):
    lines = path.read_text(errors='ignore').strip().splitlines() if path.exists() else []
    return lines[0][:100] if lines else ''


def build(machine, sdk, work):
    """Clone, build the preview and return its folder, or raise with the reason."""
    repo, tag, path = machine['repository'], machine.get('tag'), machine['path']
    clone = work / f"{machine['id']}-src"
    r = run(['git', 'clone', '-q', '--depth', '1'] + (['--branch', tag] if tag else []) + [repo, str(clone)])
    if r.returncode: raise RuntimeError('clone failed: ' + r.stderr.strip()[-300:])
    source = clone / path
    out = work / machine['id']
    r = run([sys.executable, 'sdk.py', 'preview', '--machine', str(source), '--out', str(out)], cwd=sdk)
    if r.returncode or not (out / 'engine.wasm').exists():
        raise RuntimeError('preview build failed: ' + (r.stdout + r.stderr).strip()[-400:])
    licence = next((p for p in [clone / 'LICENSE', clone / 'LICENSE.md', clone / 'LICENSE.txt', source / 'LICENSE', source / 'LICENSE.md'] if p.exists()), None)
    if not licence: raise RuntimeError('no licence file: not installed')
    shutil.copy(licence, out / 'LICENSE.txt')
    credits = source / 'assets' / 'CREDITS.md'  # recordings a kit uses, with their licences
    if credits.exists(): shutil.copy(credits, out / 'RECORDINGS.md')
    if machine.get('kind') == 'drum':  # each key's own model and controls, as the device plays them
        (out / 'drum_keys.json').write_text(json.dumps(drum_keys(source, machine['id'], sdk)))
    return out


def install(machine, built):
    """Copy a built preview into machines/<id>/ and return its index entry."""
    target = MACHINES / machine['id']
    if target.exists(): shutil.rmtree(target)
    target.mkdir(parents=True)
    for name in ['engine.wasm', 'panel.svg', 'panel.grayscale.svg', 'LICENSE.txt', 'RECORDINGS.md']:
        if (built / name).exists(): shutil.copy(built / name, target / name)
    manifest = json.loads((built / 'manifest.json').read_text())
    slim = {k: manifest[k] for k in ['engine', 'description', 'definition', 'sample_rate', 'graphics'] if k in manifest}
    slim['hasGray'] = (built / 'panel.grayscale.svg').exists()
    if (built / 'drum_keys.json').exists(): slim['drumKeys'] = json.loads((built / 'drum_keys.json').read_text())
    (target / 'manifest.json').write_text(json.dumps(slim, separators=(',', ':')))
    d = manifest['definition']
    return {
        'id': machine['id'], 'kind': machine.get('kind', 'synth'), 'name': d['name'],
        'description': manifest.get('description') or machine.get('description', ''),
        'maintainer': machine.get('maintainer', ''), 'repository': machine.get('repository', ''), 'tag': machine.get('tag', ''),
        'keywords': machine.get('keywords', []),
        'params': [q['label'] for q in d['parameters'] if not q.get('absent')],
        'presets': list((d.get('presets') or {}).keys()),
        'license': first_line(target / 'LICENSE.txt'),
    }


def bump_version():
    """Raise the version in sw.js, app.js and index.html; return the new one."""
    sw = (SITE / 'sw.js').read_text()
    old = re.search(r"const VERSION = '(\d+)'", sw).group(1)
    new = str(int(old) + 1)
    for name, pairs in [('sw.js', [(f"const VERSION = '{old}'", f"const VERSION = '{new}'")]),
                        ('app.js', [(f"const VERSION = '{old}'", f"const VERSION = '{new}'"), (f'i18n.js?v={old}', f'i18n.js?v={new}')]),
                        ('index.html', [(f'app.bundle.js?v={old}', f'app.bundle.js?v={new}')])]:
        p = SITE / name
        text = p.read_text()
        for a, b in pairs:
            if a not in text: raise RuntimeError(f'{name}: "{a}" not found; versions out of step')
            text = text.replace(a, b)
        p.write_text(text)
    return new


def write_credits(index):
    """Rewrite the machine table of CREDITS.md from the index."""
    p = SITE / 'CREDITS.md'
    lines = p.read_text().splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith('| Machine'))
    end = start + 2
    while end < len(lines) and lines[end].startswith('|'): end += 1
    rows = [f"| {m['name'] + (' (kit de batterie)' if m.get('kind') == 'drum' else '')} | {m['maintainer']} | "
            f"{m['repository'] or '—'} | {m['tag']} | {m['license'] or '—'} |" for m in sorted(index, key=lambda m: m['name'].lower())]
    p.write_text('\n'.join(lines[:start + 2] + rows + lines[end:]) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--sdk', required=True, help='an Open-XY checkout (its sdk.py and catalog)')
    parser.add_argument('--summary', help='write what changed here, in Markdown')
    args = parser.parse_args()
    sdk = pathlib.Path(args.sdk).resolve()

    catalog = json.loads((sdk / 'catalog' / 'machines.json').read_text())['machines']
    index = json.loads((MACHINES / 'index.json').read_text())
    have = {m['id']: m for m in index}
    wanted = [m for m in catalog if m.get('kind') in KINDS and m.get('status') == 'published'
              and m.get('repository') and m['id'] not in EXCLUDE]
    todo = [m for m in wanted if m['id'] not in have or have[m['id']].get('tag') != m.get('tag')]
    gone = sorted(i for i, m in have.items() if m.get('repository') and i not in {w['id'] for w in wanted})

    added, updated, failed = [], [], []
    with tempfile.TemporaryDirectory() as tmp:
        for m in todo:
            try:
                entry = install(m, build(m, sdk, pathlib.Path(tmp)))
            except Exception as e:  # one broken machine never blocks the others
                failed.append((m['id'], str(e)))
                print(f"FAIL {m['id']}: {e}")
                continue
            (updated if m['id'] in have else added).append((m['id'], have.get(m['id'], {}).get('tag'), m.get('tag')))
            have[m['id']] = entry
            print(f"OK   {m['id']} {m.get('tag')}")

    # The SDK's browser host follows the SDK the machines were built with.
    host_changed = False
    for name in SDK_MODULES:
        src, dst = sdk / 'sdk' / 'browser' / name, SITE / 'sdk' / 'browser' / name
        if not dst.exists() or src.read_bytes() != dst.read_bytes():
            shutil.copy(src, dst)
            host_changed = True

    changed = bool(added or updated or host_changed)
    version = None
    if changed:
        order = [m['id'] for m in index]
        new_index = [have[i] for i in order if i in have] + [have[a[0]] for a in added]
        (MACHINES / 'index.json').write_text(json.dumps(new_index, ensure_ascii=False, indent=1))
        write_credits(new_index)
        r = run([sys.executable, str(SITE / 'tools' / 'build.py')], cwd=SITE)
        if r.returncode: sys.exit('tools/build.py failed:\n' + r.stdout + r.stderr)
        version = bump_version()
        r = run([sys.executable, str(SITE / 'tools' / 'build.py')], cwd=SITE)
        if r.returncode: sys.exit('tools/build.py failed:\n' + r.stdout + r.stderr)

    lines = [f'## Open-XY machines, LAB_XY version {version}' if version else '## Open-XY machines: nothing new', '']
    names = {m['id']: m.get('name') or m['id'] for m in catalog}
    for mid, _, tag in added: lines.append(f'- **New:** {names.get(mid, mid)} (`{mid}`, {tag})')
    for mid, old, tag in updated: lines.append(f'- **Updated:** {names.get(mid, mid)} (`{mid}`, {old} → {tag})')
    if host_changed: lines.append('- **SDK browser host** refreshed in `sdk/browser/`')
    for mid, why in failed: lines.append(f'- **Not installed:** `{mid}`: {why[:300]}')
    if gone: lines.append(f"- **No longer in the catalog** (kept, check by hand): {', '.join(gone)}")
    lines += ['', 'Try the Netlify deploy preview of this pull request (a few machines, a demo) before merging.']
    summary = '\n'.join(lines) + '\n'
    print(summary)
    if args.summary: pathlib.Path(args.summary).write_text(summary)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f: f.write(f"changed={'true' if changed else 'false'}\n")


if __name__ == '__main__':
    main()
