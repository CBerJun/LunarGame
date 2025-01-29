import glob
import os
import sys
import subprocess
import shutil
import re
import contextlib
import json

build_script_mtime = os.path.getmtime(__file__)

def builder(output, inputs):
    """
    Return a decorator that:
    * Is used to wrap functions that receive no parameter and return an
      `int`, using 0 to indicate a normal exit.
    * Skips the call to the wrapped function when:
      - All files in `inputs` are older than `output` (last modified
        time is checked), or
      - This build script itself has been modified after the `output`
        was modified.
    * Prints out informational messages to stdout when the wrapped
      function is called.
    """
    def _decorator(func):
        func_name = getattr(func, "__name__", "?")
        def _print(message):
            print(f"[{func_name}] {message}")
        def _decorated():
            _print(f"{inputs} -> {output}")
            try:
                out_time = os.path.getmtime(output)
            except OSError:
                pass
            else:
                if build_script_mtime < out_time:
                    for in_file in inputs:
                        try:
                            src_time = os.path.getmtime(in_file)
                        except OSError as exc:
                            _print(f"ERROR: {in_file}: {exc}")
                            return 1
                        if src_time >= out_time:
                            break
                    else:
                        _print(f"using cache")
                        return 0
            return func()
        return _decorated
    return _decorator

RELEASE = False
BOARD_PATTERN = re.compile(r"BOARD_BEGIN\((\w+),")

@builder("build/boards_glue.c", ["src/backend/boards_data.inc"])
def build_boards_glue() -> int:
    with open("src/backend/boards_data.inc", "r", encoding="utf-8") as fp:
        src = fp.read()
    name2id = {}
    for match in BOARD_PATTERN.finditer(src):
        name2id[match.group(1)] = len(name2id)
    with open("build/boards_glue.c", "w", encoding="utf-8") as fp:
        fp.write(
            '#include "../src/backend/lunar_game.h"\n'
            '#include <emscripten/emscripten.h>\n'
            'void EMSCRIPTEN_KEEPALIVE Glue_InitDisplayableBoard('
            'DisplayableBoard *board, int preset) {'
            'switch (preset) {'
        )
        for name, id_ in name2id.items():
            fp.write(
                f"case {id_}:"
                f"INIT_DISPLAYABLE_PRESET_BOARD(board, {name}); break;"
            )
        fp.write('}}')
    with open("src/frontend/boards.js", "w", encoding="utf-8") as fp:
        fp.write("export const Boards = {")
        for name, id_ in name2id.items():
            fp.write(f"{name}: {id_},")
        fp.write("length: %d};" % len(name2id))
    return 0

CONST_PATTERN = re.compile(r'ITEM\((\w+),')

@builder("src/frontend/backend_consts.js", ["src/frontend/consts_glue.inc"])
def build_consts_glue() -> int:
    with open("src/frontend/consts_glue.inc", "r", encoding="utf-8") as fp:
        src = fp.read()
    names = [m.group(1) for m in CONST_PATTERN.finditer(src)]
    with open("src/frontend/backend_consts.js", "w", encoding="utf-8") as fp:
        fp.write("export const BackendConstNames = ")
        json.dump(names, fp)
        fp.write(";")
    return 0

ALL_C_SOURCES = [
    *glob.iglob("src/backend/*.c"),
    "src/frontend/glue.c",
    "build/boards_glue.c",
]
ALL_BACKEND_DEPENDENCIES = [
    *ALL_C_SOURCES,
    "src/backend/lunar_game.h",
    "src/backend/boards_data.inc",
    "src/frontend/consts_glue.inc",
]
EXPORTED_C_FUNCTIONS = [
    # The glue functions were defined with EMSCRIPTEN_KEEPALIVE and do
    # not need to be included here.
    "malloc",
    "free",
    "PatternNode_DeleteChain",
    "GameBoard_Delete",
    "GameBoard_DestroyCard",
]

@builder("src/frontend/backend.js", ALL_BACKEND_DEPENDENCIES)
def build_backend() -> int:
    backend_files = " ".join(ALL_C_SOURCES)
    flags = "-D NDEBUG -O3 -sASSERTIONS=0" if RELEASE else ""
    exports = ",".join("_" + x for x in EXPORTED_C_FUNCTIONS)
    return os.system(
        f"emcc -std=c99 -Wall {flags} {backend_files}"
        " -D LUNAR_EMCC_TAKE_A_BREAK"
        f" -sEXPORTED_FUNCTIONS={exports} -sEXPORT_ES6"
        " -sEXPORTED_RUNTIME_METHODS=getValue,setValue,cwrap"
        ' -sENVIRONMENT=web "-sINCOMING_MODULE_JS_API=[]"'
        " -sASYNCIFY"
        " -o src/frontend/backend.js"
    )

@builder("build/lunar.bundle.js", [
    "src/frontend/backend.js",
    "src/frontend/boards.js",
    "src/frontend/backend_consts.js",
    "src/frontend/frontend.js",
])
def build_bundle() -> int:
    return subprocess.run(
        ["npx", "rollup", "frontend.js", "-f", "iife",
         "-o", "../../build/lunar.bundle.js",
         "-p", "@rollup/plugin-node-resolve",
         "--output.name", "lunar"],
        cwd="./src/frontend", shell=True
    ).returncode

@builder("dist/lunar.bundle.min.js", ["build/lunar.bundle.js"])
def minify_bundle():
    popen = subprocess.Popen(
        ["npx", "minify", "../../build/lunar.bundle.js"],
        cwd="./src/frontend", shell=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    out, err = popen.communicate()
    if err or not out:
        return 1
    with open("dist/lunar.bundle.min.js", "wb") as fp:
        fp.write(out)
    return 0

STATIC_FILES = [
    "index.html",
    "lunar.css",
    "backend.wasm",
    "favicon.ico",
    *glob.iglob("images/*", root_dir="src/frontend"),
]

def _make_static_builder(file: str):
    @builder(f"dist/{file}", [f"src/frontend/{file}"])
    def copy_static():
        shutil.copyfile(f"src/frontend/{file}", f"dist/{file}")
        return 0
    return copy_static

static_builders = tuple(map(_make_static_builder, STATIC_FILES))

def copy_all_static() -> int:
    for builder in static_builders:
        c = builder()
        if c:
            return c
    return 0

def main() -> int:
    with contextlib.suppress(FileExistsError):
        os.mkdir("build")
    with contextlib.suppress(FileExistsError):
        os.mkdir("dist")
    with contextlib.suppress(FileExistsError):
        os.mkdir("dist/images")
    return (
        build_boards_glue()
        or build_consts_glue()
        or build_backend()
        or build_bundle()
        or minify_bundle()
        or copy_all_static()
    )

if __name__ == "__main__":
    sys.exit(main())
