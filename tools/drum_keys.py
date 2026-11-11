"""Read a drum kit's per-key defaults from its source, as the OP-XY does.

On the device each of a kit's 24 keys (canonical notes 53..76) plays its own
model with its own eight controls, from the kit's drum_defaults(). The
browser preview has a single model for every key, so LAB_XY stores the
defaults with the machine (manifest.json "drumKeys") and selects them per note.

    python tools/drum_keys.py <machine source folder> <id> <open-xy checkout>

prints the 24 keys as JSON. Needs a host C++ compiler (c++, g++ or clang++).
"""
import json, pathlib, shutil, subprocess, sys, tempfile

PROGRAM = r'''
#include "core.h"
#include "engine.cpp"
#include <cstdio>
int main() {
    std::printf("[");
    for (unsigned key = 53; key <= 76; ++key) {
        opxy::u8 model = 0, controls[8] = {0, 0, 0, 0, 0, 0, 0, 0};
        NS::drum_defaults(key, &model, controls);
        std::printf("%s{\"model\": %u, \"name\": \"", key > 53 ? ", " : "", model);
        for (const char* c = NS::model_name(model); c && *c; ++c) if (*c != '"' && *c != '\\') std::putchar(*c);
        std::printf("\", \"controls\": [");
        for (int k = 0; k < 8; ++k) std::printf("%s%u", k ? ", " : "", controls[k]);
        std::printf("]}");
    }
    std::printf("]\n");
}
'''


def drum_keys(source, machine_id, sdk):
    source, sdk = pathlib.Path(source).resolve(), pathlib.Path(sdk).resolve()
    cxx = next((c for c in ['c++', 'g++', 'clang++'] if shutil.which(c)), None)
    if not cxx: raise RuntimeError('no host C++ compiler')
    with tempfile.TemporaryDirectory() as tmp:
        main, exe = pathlib.Path(tmp) / 'keys.cpp', pathlib.Path(tmp) / 'keys'
        main.write_text(PROGRAM.replace('NS::', machine_id + '::'))
        r = subprocess.run([cxx, '-std=c++11', '-O1', '-w', f'-I{sdk / "sdk" / "include"}', f'-I{source}', str(main), '-o', str(exe)],
                           capture_output=True, text=True, timeout=300)
        if r.returncode: raise RuntimeError('compile failed: ' + r.stderr.strip()[-400:])
        r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=60)
        if r.returncode: raise RuntimeError('run failed')
        keys = json.loads(r.stdout)
    assert len(keys) == 24
    return keys


if __name__ == '__main__':
    print(json.dumps(drum_keys(*sys.argv[1:4])))
