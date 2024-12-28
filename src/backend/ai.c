#include "lunar_game.h"

AIDecision *AIMove(
    const GameBoard *board, const MoonPhase *choices, int num_choices
) {
    // A dummy AI...
    AIDecision *d = (AIDecision *) malloc(sizeof(AIDecision));
    d->choice_id = 0;
    for (int i = 0; i < board->num_slots; ++i) {
        if (board->slots[i].phase == MP_NULL) {
            d->slot_id = i;
            break;
        }
    }
    return d;
}
