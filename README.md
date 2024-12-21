# Rise of the Half Moon Clone

**NOTE: WORK IN PROGRESS.**

This is a clone of Google's Doodle on October 24, 2024:
[Rise of the Half Moon][doodle], which is a **lunar-themed board game**. I
found this game quite fun so I decided to recreate it.

[doodle]: https://doodles.google/doodle/rise-of-the-half-moon/

## Technical Details

The backend of the project is written in C99. It is also written in such a way
that it is compatible with C++11. The backend will be compiled into
[WebAssembly][wasm] so that it can run in a browser, and the frontend is
written in JavaScript/HTML/CSS.

[wasm]: https://webassembly.org/

## Originality

The *game design* credit goes to Google. However, all the code and assets in
this repo were created by me. You may find, for example, the card textures in
my clone quite similar to Google's; but if you look closely, they are quite
different as my cards were flexible SVGs while Google's were PNGs.
