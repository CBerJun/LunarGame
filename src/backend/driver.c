/* Game "driver" -- game loop, card management */

#include "lunar_game.h"
#include <assert.h>

MoonPhase RandomPhase(void) {
    /* Requires rand() random engine initialized. */
    return (MoonPhase) (rand() % MoonPhase_NumPhases);
}

int ComputeStars(const PatternNode *patterns) {
    int score = 0;
    for (const PatternNode *p = patterns; p; p = p->next) {
        switch (p->pattern->kind) {
        case PK_PHASE_PAIR:
            ++score;
            break;
        case PK_FULL_MOON:
            score += 2;
            break;
        case PK_LUNAR_CYCLE:
            for (SlotNode *s = p->pattern->list; s; s = s->next) {
                ++score;
            }
            break;
        default:
            assert(false && "invalid pattern");
        }
    }
    return score;
}

void LunarGame_Init(LunarGame *game) {
    game->white_stars = game->black_stars = 0;
    for (int i = 0; i < NUM_CARDS_IN_A_HAND; ++i) {
        game->black_cards[i] = RandomPhase();
        game->white_cards[i] = RandomPhase();
    }
}

PatternNode *LunarGame_PlayCard(
    LunarGame *game, Player player, int card_index, int slot_id
) {
    assert(player != P_NULL);
    MoonPhase *card = &(
        player == P_WHITE ? game->white_cards : game->black_cards
    )[card_index];
    PatternNode *res = GameBoard_PutCard(game->board, slot_id, *card, player);
    *card = RandomPhase();
    return res;
}
