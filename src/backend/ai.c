#include <float.h>
#include <math.h>
#include <string.h>
#include "lunar_game.h"

#define AI_DEBUG 0

#if AI_DEBUG
#include <stdio.h>
#endif

static void forkGameBoard(const GameBoard *board, GameBoard *to) {
    to->num_slots = board->num_slots;
    // `adj` does not change throughout the whole game so do a shallow
    // copy
    to->adj = board->adj;
    to->black_stars = board->black_stars;
    to->white_stars = board->white_stars;
    for (int i = 0; i < to->num_slots; ++i) {
        SlotData *data = &to->slots[i];
        SlotData_Deinit(data);
        data->owner = board->slots[i].owner;
        data->phase = board->slots[i].phase;
        data->lc_predecessors = SlotNode_DuplicateChain(
            board->slots[i].lc_predecessors, NULL
        );
        data->lc_successors = SlotNode_DuplicateChain(
            board->slots[i].lc_successors, NULL
        );
    }
}

static float heuristic(const GameBoard *board) {
    int res = board->black_stars - board->white_stars;
    for (int i = 0; i < board->num_slots; ++i) {
        switch (board->slots[i].owner) {
        case P_BLACK:
            ++res;
            break;
        case P_WHITE:
            --res;
            break;
        case P_NULL:  /* to avoid -Wswitch */
            break;
        }
    }
    return (float) res;
}

typedef enum NodeKind {
    NK_MY_TURN,
    NK_OPPONENT_TURN,
    NK_DRAW_MY_CARD,
} NodeKind;

typedef struct PrevDecision {
    MoonPhase phase;
    int slot_id;
} PrevDecision;

#if AI_DEBUG
static void printPrevDecisions(PrevDecision *p, int len) {
    putchar('[');
    for (int i = 0; i < len; ++i) {
        printf("(phase %d, slot %d)", p->phase, p->slot_id);
        if (i != len - 1) {
            puts(", ");
        }
    }
    putchar(']');
}
#endif

typedef struct CacheHashMeta {
    int len;
    int total_states;
} CacheHashMeta;

static Hash cacheHash(void *key, void *meta) {
    Hash res = 1u;
    CacheHashMeta *m = (CacheHashMeta *) meta;
    PrevDecision *arr = (PrevDecision *) key;
    for (int i = 0; i < m->len; ++i) {
        res *= m->total_states;
        res += arr[i].phase + arr[i].slot_id * MoonPhase_NumPhases;
    }
    return res;
}

static bool cacheEq(void *key1, void *key2, void *meta) {
    return !memcmp(
        key1, key2, ((CacheHashMeta *) meta)->len * sizeof(PrevDecision)
    );
}

static float expectiminimax(
    const GameBoard *board,
    MoonPhase *cards,  /* We will restore after modifying it */
    int num_cards,  /* Length of `cards` */
    int played_card,  /* Index in `cards` */
    float alpha,  /* For pruning */
    int depth,
    NodeKind node,
    AIDecision *out_result,
    // Following 3 parameters are for caching optimization
    // The core idea of this:
    // 1. The SCORE/WEIGHT outcome is the same if the computer performs
    //    the exact same set of `prev_decisions`, no matter what CARDS
    //    remain in its hand.
    // 2. However, CARDS do affect the computer's decision next time
    //    when it's its turn (NK_MY_TURN).
    // 3. However, for the LAST layer of NK_MY_TURN nodes, there is NO
    //    next layer of NK_MY_TURN nodes! Thus we can ignore what CARDS
    //    remain in the computer's hand in that layer, and conclude
    //    that: in that layer, as long as the `prev_decisions` is the
    //    same for two nodes, then the weight must be the same too.
    // 4. We save some memory by allocating the hash map on the first
    //    layer of NK_MY_TURN nodes. This is based on the fact that: if
    //    X and Y are two first-layer NK_MY_TURN nodes, then any
    //    ancestor of X don't have the same `prev_decisions` with any
    //    ancestor of Y, because the decisions made at X and Y are 100%
    //    different.
    HashMap *cache,  /* PrevDecision[] -> float */
    PrevDecision *prev_decisions,
    int pd_ptr  /* Index in `prev_decisions` */
) {
    if (depth == 0) {
        return heuristic(board);
    }
    --depth;
    float res;
    GameBoard fork;
    if (node != NK_DRAW_MY_CARD) {
        fork.slots = (SlotData *) malloc(board->num_slots * sizeof(SlotData));
        for (int i = 0; i < board->num_slots; ++i) {
            fork.slots[i].lc_predecessors = fork.slots[i].lc_successors = NULL;
        }
    }
    switch (node) {
    case NK_MY_TURN:
        res = -FLT_MAX;
        BitSet *phase_seen = BitSet_New(MoonPhase_NumPhases);
        BitSet_Zero(phase_seen);
        const bool first_layer = cache == NULL;
        const bool last_layer = depth <= 2;
        // Not the only layer:
        const bool cacheable = !(first_layer && last_layer);
        const int expected_layers = depth / 3;
        CacheHashMeta cache_meta;
        if (cacheable) {
            if (first_layer) {
                prev_decisions = (PrevDecision *)
                    malloc(sizeof(PrevDecision) * expected_layers);
                pd_ptr = 0;
            }
            else {
                ++pd_ptr;
            }
        }
        for (int k = 0; k < num_cards; ++k) {
            const MoonPhase phase = cards[k];
            if (BitSet_Get(phase_seen, (int) phase)) {
                continue;
            }
            BitSet_Set(phase_seen, (int) phase);
            for (int i = 0; i < board->num_slots; ++i) {
                if (board->slots[i].phase != MP_NULL) {
                    continue;
                }
                float weight;
                if (cacheable) {
                    if (first_layer) {
                        cache_meta.len = expected_layers;
                        cache_meta.total_states =
                            board->num_slots * MoonPhase_NumPhases;
                        cache = HashMap_New(
                            cacheHash, cacheEq, (void *) &cache_meta
                        );
#if AI_DEBUG
                        printf("New cache phase=%d slot=%d\n", phase, i);
#endif
                    }
                    else {
                        PrevDecision *decision = &prev_decisions[pd_ptr - 1];
                        decision->phase = phase;
                        decision->slot_id = i;
                    }
                    if (last_layer) {
                        void *weight_ptr = HashMap_GetOr(
                            cache, (void *) prev_decisions, NULL
                        );
                        if (weight_ptr) {
                            weight = *(float *) weight_ptr;
#if AI_DEBUG
                            printf("CacheHit %f ", weight);
                            printPrevDecisions(prev_decisions, pd_ptr);
                            putchar('\n');
#endif
                            goto weight_finished;
                        }
                    }
                }
                forkGameBoard(board, &fork);
                PatternNode_DeleteChain(GameBoard_PutCard(
                    &fork, i, phase, P_BLACK
                ));
                weight = expectiminimax(
                    &fork, cards, num_cards, k, res,
                    depth, NK_OPPONENT_TURN, NULL, cache, prev_decisions,
                    pd_ptr
                );
                if (cacheable) {
                    if (last_layer) {
                        float *weight_ptr = (float *) malloc(sizeof(float));
                        *weight_ptr = weight;
                        // pd_ptr == length of prev_decisions in last layer
                        size_t size = sizeof(PrevDecision) * pd_ptr;
                        PrevDecision *pd_copy = (PrevDecision *) malloc(size);
                        memcpy(pd_copy, prev_decisions, size);
                        HashMap_Insert(
                            cache, (void *) pd_copy, (void *) weight_ptr
                        );
#if AI_DEBUG
                        printf("CacheMiss %f ", weight);
                        printPrevDecisions(pd_copy, pd_ptr);
                        putchar('\n');
#endif
                    }
                    if (first_layer) {
                        HashMap_ITER_ENTRIES(cache, pair)
                            free(pair->key);
                            free(pair->value);
                        HashMap_ITER_END
                        HashMap_Delete(cache);
                    }
                }
weight_finished:
                if (weight > res) {
                    res = weight;
                    if (out_result) {
                        out_result->card_id = k;
                        out_result->slot_id = i;
                    }
                }
            }
        }
        if (cacheable && first_layer) {
            free(prev_decisions);
        }
        BitSet_Delete(phase_seen);
        if (res == -FLT_MAX) {  // Full game board
            res = heuristic(board);
        }
        break;
    case NK_OPPONENT_TURN:
        res = FLT_MAX;
        for (int i = 0; i < board->num_slots; ++i) {
            if (board->slots[i].phase != MP_NULL) {
                continue;
            }
            for (int j = 0; j < MoonPhase_NumPhases && res > alpha; ++j) {
                forkGameBoard(board, &fork);
                PatternNode_DeleteChain(GameBoard_PutCard(
                    &fork, i, (MoonPhase) j, P_WHITE
                ));
                res = fminf(res, expectiminimax(
                    &fork, cards, num_cards, played_card, 0,
                    depth, NK_DRAW_MY_CARD, NULL, cache, prev_decisions,
                    pd_ptr
                ));
            }
        }
        if (res == FLT_MAX) {  // Full game board
            res = heuristic(board);
        }
        break;
    case NK_DRAW_MY_CARD:
        if (depth == 0) {
            // Fast path if chance nodes happen to be the last layer
            return heuristic(board);
        }
        res = 0;
        MoonPhase old_card = cards[played_card];
        for (int j = 0; j < MoonPhase_NumPhases; ++j) {
            cards[played_card] = (MoonPhase) j;
            res += expectiminimax(
                board, cards, num_cards, -1, 0,
                depth, NK_MY_TURN, NULL, cache, prev_decisions,
                pd_ptr
            );
        }
        cards[played_card] = old_card;
        res /= MoonPhase_NumPhases;
        break;
    }
    if (node != NK_DRAW_MY_CARD) {
        for (int i = 0; i < board->num_slots; ++i) {
            SlotData_Deinit(&fork.slots[i]);
        }
        free(fork.slots);
    }
    return res;
}

AIDecision *AIMove(
    const GameBoard *board,
    MoonPhase *choices,  /* We modify it but will restore it */
    int num_choices,
    int depth
) {
    // A dummy AI...
    AIDecision *d = (AIDecision *) malloc(sizeof(AIDecision));
    expectiminimax(
        board, choices, num_choices, -1, 0,
        depth, NK_MY_TURN, d, NULL, NULL, -1
    );
    return d;
}
