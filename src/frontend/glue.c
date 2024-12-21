/* This is only intended to be compiled as a C file (not C++). */

#include "../backend/lunar_game.h"
#include <emscripten/emscripten.h>

LunarGame * EMSCRIPTEN_KEEPALIVE Glue_NewLunarGame(void) {
    return (LunarGame *) malloc(sizeof(LunarGame));
}

void EMSCRIPTEN_KEEPALIVE Glue_Free(void *ptr) {
    free(ptr);
}
