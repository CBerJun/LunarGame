#include "lunar_game.h"

#define BOARD_BEGIN(name, num) \
    const int PresetBoard_N_ ## name = num; \
    const int PresetBoard_Data_ ## name[] = {
#define EDGE(x, y) x, y,
#define BOARD_END -1};
#define DISPLAY_BEGIN(name, x_len, y_len) \
    const int \
        PresetBoard_XLen_ ## name = x_len, \
        PresetBoard_YLen_ ## name = y_len; \
    const SlotPos PresetBoard_Display_ ## name[] = {
#define POS(x, y) {x, y},
#define DISPLAY_END };
#include "boards_data.inc"
