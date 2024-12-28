#include "../backend/lunar_game.h"
#include <stdint.h>
#include <stddef.h>  /* offsetof() used in consts_glue.inc */
#include <emscripten/emscripten.h>

static const int32_t exported_constants[] = {
#define ITEM(name, value) value,
#include "consts_glue.inc"
#undef ITEM
};

const int32_t * EMSCRIPTEN_KEEPALIVE Glue_IntConstants(void) {
    return exported_constants;
}

PatternNode * EMSCRIPTEN_KEEPALIVE Glue_PutCard(
    GameBoard *board, int slot_id, int phase, int player
) {
    return GameBoard_PutCard(
        board, slot_id, (MoonPhase) phase, (Player) player
    );
}

int EMSCRIPTEN_KEEPALIVE Glue_PatternKind(const Pattern *p) {
    return (int) p->kind;
}

bool EMSCRIPTEN_KEEPALIVE Glue_IsNull(void *ptr) {
    return ptr == NULL;
}

AIDecision * EMSCRIPTEN_KEEPALIVE Glue_AIMove(
    const GameBoard *board, const int *choices, int num_choices
) {
    MoonPhase *new_choices = malloc(sizeof(MoonPhase) * num_choices);
    for (int i = 0; i < num_choices; ++i) {
        new_choices[i] = (MoonPhase) choices[i];
    }
    AIDecision *res = AIMove(board, new_choices, num_choices);
    free(new_choices);
    return res;
}
