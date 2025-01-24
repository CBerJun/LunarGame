#ifndef LUNAR_GAME_H
#define LUNAR_GAME_H

#include <stdbool.h>
#include <stdlib.h>

/* hash_map.c */

// Must be an unsigned integer type:
typedef unsigned long long Hash;

typedef struct HashPair {
    void *key;
    void *value;
    struct HashPair *next;
} HashPair;

typedef Hash (*HashFunc)(void *key, void *meta);
typedef bool (*EqFunc)(void *key1, void *key2, void *meta);

typedef struct HashMap {
    HashPair **buckets;  // array of linked lists of `HashPair`
    int capacity;
    int size;
    HashFunc hash;
    EqFunc eq;
    void *meta;
} HashMap;

HashMap *HashMap_New(HashFunc hash, EqFunc eq, void *meta);
void HashMap_Delete(HashMap *map);
void HashMap_Insert(HashMap *map, void *key, void *value);
void *HashMap_Get(const HashMap *map, void *key);
void HashMap_Set(HashMap *map, void *key, void *value);
void *HashMap_GetOr(const HashMap *map, void *key, void *default_);
bool HashMap_Has(const HashMap *map, void *key);

#define HashMap_ITER_ENTRIES(map, var) \
    for (int i = 0; i < map->capacity; ++i) { \
        for (HashPair *var = map->buckets[i]; var; var = var->next) {
#define HashMap_ITER_END }}

/* bitset.c */

typedef struct BitSet {
    unsigned char *data;
    int bytes;
    int bits;
} BitSet;

BitSet *BitSet_New(int bits);
void BitSet_Delete(BitSet *bs);
bool BitSet_Get(const BitSet *bs, int index);
void BitSet_Set(BitSet *bs, int index);
void BitSet_Unset(BitSet *bs, int index);
void BitSet_Zero(BitSet *bs);
bool BitSet_Equal(const BitSet *bs1, const BitSet *bs2);
Hash BitSet_Hash(const BitSet *bs);

/* core.c */

typedef enum MoonPhase {
    MP_NULL = -1,
    MP_NEW_MOON = 0,
    MP_WAXING_CRESCENT,
    MP_FIRST_QUARTER,
    MP_WAXING_GIBBOUS,
    MP_FULL,
    MP_WANING_GIBBOUS,
    MP_FINAL_QUARTER,
    MP_WANING_CRESCENT,
    // Total number of moon phases; must be even
    MoonPhase_NumPhases,
} MoonPhase;

typedef enum Player {
    P_NULL = -1,
    P_WHITE = 0,
    P_BLACK = 1,
} Player;

typedef struct SlotNode {
    int slot_id;
    struct SlotNode *next;
} SlotNode;

void SlotNode_ChainPrepend(SlotNode **head, int slot_id);
void SlotNode_ChainPopFront(SlotNode **head);
void SlotNode_ChainRemove(SlotNode **head, int slot_id);
SlotNode *SlotNode_DuplicateChain(const SlotNode *node, SlotNode **out_tail);
SlotNode *SlotNode_NewReversedChain(const SlotNode *node);
void SlotNode_DeleteChain(SlotNode *node);

typedef struct SlotsNode {
    SlotNode *slots;
    struct SlotsNode *next;
} SlotsNode;

void SlotsNode_ChainPrepend(SlotsNode **head, SlotNode *slots);
void SlotsNode_DeleteChain(SlotsNode *node);

typedef struct SlotData {
    MoonPhase phase;
    Player owner;
    // For the Lunar Cycle graph:
    SlotNode *lc_predecessors;
    SlotNode *lc_successors;
} SlotData;

void SlotData_Init(SlotData *data);
void SlotData_Deinit(SlotData *data);

typedef struct GameBoard {
    // Game board
    int num_slots;
    SlotData *slots;
    SlotNode **adj;
    // Game states
    int white_stars;
    int black_stars;
} GameBoard;

GameBoard *GameBoard_New(int num_slots);
void GameBoard_Delete(GameBoard *board);
void GameBoard_AddEdge(GameBoard *board, int id1, int id2);
GameBoard *GameBoard_FromEdges(int num_slots, const int *edges);

typedef enum PatternKind {
    PK_PHASE_PAIR,
    PK_FULL_MOON,
    PK_LUNAR_CYCLE,
} PatternKind;

#define MIN_LUNAR_CYCLE_LEN 3

typedef struct Pattern {
    PatternKind kind;
    union {
        int other_id;  // PK_PHASE_PAIR, PK_FULL_MOON
        SlotNode *list;  // PK_LUNAR_CYCLE
    };
} Pattern;

Pattern *Pattern_New(void);
void Pattern_Delete(Pattern *pattern);

typedef struct PatternNode {
    Pattern *pattern;
    struct PatternNode *next;
} PatternNode;

void PatternNode_ChainPrepend(PatternNode **head, Pattern *pattern);
void PatternNode_DeleteChain(PatternNode *node);

PatternNode *GameBoard_PutCard(
    GameBoard *board, int slot_id, MoonPhase phase, Player player
);
void GameBoard_DestroyCard(GameBoard *board, int slot_id);

/* boards.c */

typedef struct SlotPos {
    int x;
    int y;
} SlotPos;

typedef struct DisplayableBoard {
    GameBoard *board;
    int x_len;
    int y_len;
    const SlotPos *slot_pos;  /* Borrowed reference */
} DisplayableBoard;

#define NEW_PRESET_BOARD(name) \
    GameBoard_FromEdges(PresetBoard_N_ ## name, PresetBoard_Data_ ## name)
#define INIT_DISPLAYABLE_PRESET_BOARD(ptr, name) do { \
    DisplayableBoard *_expr = (ptr); \
    _expr->board = NEW_PRESET_BOARD(name); \
    _expr->x_len = PresetBoard_XLen_ ## name; \
    _expr->y_len = PresetBoard_YLen_ ## name; \
    _expr->slot_pos = PresetBoard_Display_ ## name; \
} while (0)

#define BOARD_BEGIN(name, num) \
    extern const int PresetBoard_N_ ## name; \
    extern const int PresetBoard_Data_ ## name[];
#define EDGE(x, y)
#define BOARD_END
#define DISPLAY_BEGIN(name, x_len, y_len) \
    extern const SlotPos PresetBoard_Display_ ## name[]; \
    extern const int PresetBoard_XLen_ ## name, PresetBoard_YLen_ ## name;
#define POS(x, y)
#define DISPLAY_END
#include "boards_data.inc"

/* ai.c */

typedef struct AIDecision {
    int card_id;
    int slot_id;
} AIDecision;

AIDecision *AIMove(
    const GameBoard *board, MoonPhase *choices, int num_choices, int depth
);

#endif  /* LUNAR_GAME_H */
