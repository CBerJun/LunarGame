/* Core game logic and algorithm. */

#include <assert.h>
#include "lunar_game.h"

void SlotNode_DeleteChain(SlotNode *node) {
    while (node != NULL) {
        SlotNode *next = node->next;
        free(node);
        node = next;
    }
}

void SlotNode_ChainPrepend(SlotNode **head, int slot_id) {
    SlotNode *new_node = (SlotNode *) malloc(sizeof(SlotNode));
    new_node->next = *head;
    new_node->slot_id = slot_id;
    *head = new_node;
}

void SlotNode_ChainPopFront(SlotNode **head) {
    assert(head && "Pop from empty list");
    SlotNode *new_head = (*head)->next;
    free(*head);
    *head = new_head;
}

SlotNode *SlotNode_DuplicateChain(const SlotNode *node, SlotNode **out_tail) {
    if (node == NULL) {
        return NULL;
    }
    SlotNode *head = NULL;
    SlotNode_ChainPrepend(&head, node->slot_id);
    SlotNode *tail = head;
    for (const SlotNode *old = node->next; old; old = old->next) {
        SlotNode *new_node = (SlotNode *) malloc(sizeof(SlotNode));
        new_node->slot_id = old->slot_id;
        tail->next = new_node;
        tail = new_node;
    }
    tail->next = NULL;
    if (out_tail) {
        *out_tail = tail;
    }
    return head;
}

SlotNode *SlotNode_NewReversedChain(const SlotNode *node) {
    SlotNode *head = NULL;
    for (; node; node = node->next) {
        SlotNode_ChainPrepend(&head, node->slot_id);
    }
    return head;
}

void SlotData_Init(SlotData *data) {
    data->owner = P_NULL;
    data->phase = MP_NULL;
    data->lc_predecessors = data->lc_successors = NULL;
}

void SlotData_Deinit(SlotData *data) {
    SlotNode_DeleteChain(data->lc_predecessors);
    SlotNode_DeleteChain(data->lc_successors);
}

GameBoard *GameBoard_New(int num_slots) {
    GameBoard *g = (GameBoard *) malloc(sizeof(GameBoard));
    g->num_slots = num_slots;
    g->slots = (SlotData *) malloc(num_slots * sizeof(SlotData));
    g->adj = (SlotNode **) malloc(num_slots * sizeof(SlotNode *));
    for (int i = 0; i < num_slots; ++i) {
        g->adj[i] = NULL;
        SlotData_Init(&g->slots[i]);
    }
    g->black_stars = g->white_stars = 0;
    return g;
}

void GameBoard_Delete(GameBoard *board) {
    for (int i = 0; i < board->num_slots; ++i) {
        SlotNode_DeleteChain(board->adj[i]);
        SlotData_Deinit(&board->slots[i]);
    }
    free(board->slots);
    free(board->adj);
    free(board);
}

void GameBoard_AddEdge(GameBoard *board, int id1, int id2) {
    SlotNode_ChainPrepend(&board->adj[id2], id1);
    SlotNode_ChainPrepend(&board->adj[id1], id2);
}

GameBoard *GameBoard_FromEdges(int num_slots, const int *edges) {
    GameBoard *g = GameBoard_New(num_slots);
    int i = 0;
    while (edges[i] != -1) {
        GameBoard_AddEdge(g, edges[i], edges[i + 1]);
        i += 2;
    }
    return g;
}

Pattern *Pattern_New(void) {
    return (Pattern *) malloc(sizeof(Pattern));
}

void Pattern_Delete(Pattern *pattern) {
    if (pattern->kind == PK_LUNAR_CYCLE) {
        SlotNode_DeleteChain(pattern->list);
    }
    free(pattern);
}

void PatternNode_DeleteChain(PatternNode *node) {
    while (node != NULL) {
        PatternNode *next = node->next;
        Pattern_Delete(node->pattern);
        free(node);
        node = next;
    }
}

void PatternNode_ChainPrepend(PatternNode **head, Pattern *pattern) {
    PatternNode *new_node = (PatternNode *) malloc(sizeof(PatternNode));
    new_node->next = *head;
    new_node->pattern = pattern;
    *head = new_node;
}

void SlotsNode_DeleteChain(SlotsNode *node) {
    while (node != NULL) {
        SlotsNode *next = node->next;
        SlotNode_DeleteChain(node->slots);
        free(node);
        node = next;
    }
}

void SlotsNode_ChainPrepend(SlotsNode **head, SlotNode *slots) {
    SlotsNode *new_node = (SlotsNode *) malloc(sizeof(SlotsNode));
    new_node->next = *head;
    new_node->slots = slots;
    *head = new_node;
}

static void findLunarCycle(
    GameBoard *board, SlotNode *stack, int stack_size, bool forward,
    SlotsNode **result
) {
    const int cur_slot = stack->slot_id;
    SlotData *data = &board->slots[cur_slot];
#ifndef NDEBUG
    MoonPhase next_phase = (MoonPhase) (
        (data->phase + (forward ? 1 : -1) + MoonPhase_NumPhases)
            % MoonPhase_NumPhases
    );
#endif
    bool did_recurse = false;
    for (
        const SlotNode *node = forward ? data->lc_successors
            : data->lc_predecessors;
        node;
        node = node->next
    ) {
        // Make sure this slot hasn't appeared in the stack
        // We won't use a set to keep track of this as there aren't
        // usually a lot of slots in real games, plus we can use the
        // fact that only every `MoonPhase_NumPhases` slots may be the
        // same.
        SlotNode *cur = stack;
        bool already_appeared = false;
        for (int i = 0; i < stack_size / MoonPhase_NumPhases; ++i) {
            for (int j = 0; j < MoonPhase_NumPhases - (i == 0); ++j) {
                cur = cur->next;
            }
            assert(board->slots[cur->slot_id].phase == next_phase);
            if (cur->slot_id == node->slot_id) {
                already_appeared = true;
                break;
            }
        }
        if (already_appeared) {
            continue;
        }
        // Recurse
        did_recurse = true;
        SlotNode_ChainPrepend(&stack, node->slot_id);
        findLunarCycle(board, stack, stack_size + 1, forward, result);
        SlotNode_ChainPopFront(&stack);
    }
    if (!did_recurse) {
        SlotsNode_ChainPrepend(result, SlotNode_DuplicateChain(stack, NULL));
    }
}

static Hash bitsetHashWrapper(void *bs, void *meta) {
    return BitSet_Hash((BitSet *) bs);
}

static bool bitsetEqWrapper(void *bs1, void *bs2, void *meta) {
    return BitSet_Equal((BitSet *) bs1, (BitSet *) bs2);
}

PatternNode *GameBoard_PutCard(
    GameBoard *board, int slot_id, MoonPhase phase, Player player
) {
    SlotData *data = &board->slots[slot_id];
    assert(data->phase == MP_NULL);
    assert(phase != MP_NULL);
    assert(player != P_NULL);
    data->phase = phase;
    // Check for patterns
    PatternNode *patterns = NULL;
    int *score = player == P_BLACK ? &board->black_stars : &board->white_stars;
    for (SlotNode *node = board->adj[slot_id]; node; node = node->next) {
        const int other_id = node->slot_id;
        SlotData *other_data = &board->slots[other_id];
        if (other_data->phase == MP_NULL) {
            continue;
        }
        Pattern *pattern = NULL;
        switch (other_data->phase - phase) {
        // Check Phase Pair
        case 0:
            pattern = Pattern_New();
            pattern->kind = PK_PHASE_PAIR;
            ++*score;
            break;
        // Check Full Moon
        case MoonPhase_NumPhases / 2:
        case -MoonPhase_NumPhases / 2:
            pattern = Pattern_New();
            pattern->kind = PK_FULL_MOON;
            *score += 2;
            break;
        // Add data to Lunar Cycle graph
        case 1:
        case 1 - MoonPhase_NumPhases:
            SlotNode_ChainPrepend(&data->lc_successors, other_id);
            SlotNode_ChainPrepend(&other_data->lc_predecessors, slot_id);
            break;
        case -1:
        case MoonPhase_NumPhases - 1:
            SlotNode_ChainPrepend(&data->lc_predecessors, other_id);
            SlotNode_ChainPrepend(&other_data->lc_successors, slot_id);
            break;
        // Unrelated phase, skip to next neighbor
        default:
            continue;
        }
        if (pattern) {
            // Phase Pair or Full Moon detected
            pattern->other_id = other_id;
            PatternNode_ChainPrepend(&patterns, pattern);
            data->owner = other_data->owner = player;
        }
    }
    SlotsNode *forward = NULL, *backward = NULL;
    SlotNode *stack = (SlotNode *) malloc(sizeof(SlotNode));
    stack->next = NULL;
    stack->slot_id = slot_id;
    findLunarCycle(board, stack, 1, true, &forward);
    findLunarCycle(board, stack, 1, false, &backward);
    SlotNode_DeleteChain(stack);
    assert(
        forward && backward
        && "findLunarCycle always gives at least 1 path"
    );
    // Combine lunar cycle paths to form candidates
    SlotsNode *candidates = NULL;
    for (SlotsNode *i = forward; i; i = i->next) {
        for (SlotsNode *j = backward; j; j = j->next) {
            // Candidate path = j + reversed(i)[1:]
            SlotNode *j_tail;
            SlotNode *head = SlotNode_DuplicateChain(j->slots, &j_tail);
            SlotNode *rev_i_head = SlotNode_NewReversedChain(i->slots);
            assert(rev_i_head && "`i` should have at least 1 slot in it");
            // The origin vertex is present in both the forward path
            // and the backward path. Remove one of them.
            SlotNode_ChainPopFront(&rev_i_head);
            j_tail->next = rev_i_head;
            SlotsNode_ChainPrepend(&candidates, head);
        }
    }
    SlotsNode_DeleteChain(forward);
    SlotsNode_DeleteChain(backward);
    // Validate lunar cycle candidates
    // Check for:
    // 1. repeated vertices
    // 2. repeated patterns (two candidates with the same set of
    // vertices)
    // Delete/Transfer ownership of candidate lists as we go
    SlotsNode *c = candidates;
    HashMap *cycles_seen = HashMap_New(
        bitsetHashWrapper, bitsetEqWrapper, NULL
    );
    while (c) {
        BitSet *bs = BitSet_New(board->num_slots);
        BitSet_Zero(bs);
        SlotNode *prev = NULL;
        int length = 0;
        for (SlotNode *i = c->slots; i; i = i->next) {
            if (BitSet_Get(bs, i->slot_id)) {
                SlotNode_DeleteChain(i);
                assert(prev && "shouldn't have a duplicate on first vertex");
                prev->next = NULL;
                break;
            }
            BitSet_Set(bs, i->slot_id);
            prev = i;
            ++length;
        }
        if (
            length >= MIN_LUNAR_CYCLE_LEN
            && !HashMap_Has(cycles_seen, (void *) bs)
        ) {
            // We've found a lunar cycle!
            HashMap_Insert(cycles_seen, (void *) bs, NULL);
            *score += length;
            Pattern *new_pattern = Pattern_New();
            new_pattern->kind = PK_LUNAR_CYCLE;
            new_pattern->list = c->slots;
            PatternNode_ChainPrepend(&patterns, new_pattern);
            // Change owner of slots on the cycle
            for (SlotNode *i = c->slots; i; i = i->next) {
                board->slots[i->slot_id].owner = player;
            }
        }
        else {
            BitSet_Delete(bs);
            SlotNode_DeleteChain(c->slots);
        }
        SlotsNode *next_c = c->next;
        free(c);
        c = next_c;
    }
    HashMap_ITER_ENTRIES(cycles_seen, pair)
        BitSet_Delete((BitSet *) pair->key);
    HashMap_ITER_END
    HashMap_Delete(cycles_seen);
    return patterns;
}
