import glob
import os
import sys
import subprocess
import shutil

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

EXPORTED_C_FUNCTIONS = [
    # The glue functions were defined with EMSCRIPTEN_KEEPALIVE and do
    # not need to be included here.
    "LunarGame_Init",
    "LunarGame_PlayCard",
]
BACKEND_FILES = glob.glob("src/backend/*.c")
RELEASE = False

@builder("src/frontend/backend.js", BACKEND_FILES + ["src/frontend/glue.c"])
def build_backend() -> int:
    backend_files = " ".join(BACKEND_FILES)
    flags = "-D NDEBUG -O3 -sASSERTIONS=0" if RELEASE else ""
    exports = ",".join("_" + x for x in EXPORTED_C_FUNCTIONS)
    return os.system(
        f"emcc -std=c99 -Wall {flags} src/frontend/glue.c {backend_files}"
        f" -sEXPORTED_FUNCTIONS={exports} -sEXPORT_ES6"
        " -o src/frontend/backend.js"
    )

@builder("build/lunar.bundle.js", [
    "src/frontend/backend.js",
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
    "card.svg",
    # "favicon.ico",
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
    return (
        build_backend()
        or build_bundle()
        or minify_bundle()
        or copy_all_static()
    )

if __name__ == "__main__":
    sys.exit(main())
