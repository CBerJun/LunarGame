/*
It seems that Emscripten does not provide a way to export global values
without using Embind (which must be used with C++) so far, so we have to
do this by exporting a function that returns a pointer representing an
array of integers that contain all the constants we want to export.

This file defines those constants, and name them. Those names will be
extracted by the build script and used on the JavaScript side to access
these constants by name.

A lot of offsetof values were exported as well in order for the
JavaScript side to access struct members.
*/

ITEM(IntSize, sizeof(int))

ITEM(PlayerWhite, P_WHITE)
ITEM(PlayerBlack, P_BLACK)

ITEM(PkPhasePair, PK_PHASE_PAIR)
ITEM(PkFullMoon, PK_FULL_MOON)
ITEM(PkLunarCycle, PK_LUNAR_CYCLE)

ITEM(DisplayableBoardSize, sizeof(DisplayableBoard))
ITEM(DisplayableBoardBoard, offsetof(DisplayableBoard, board))
ITEM(DisplayableBoardXLen, offsetof(DisplayableBoard, x_len))
ITEM(DisplayableBoardYLen, offsetof(DisplayableBoard, y_len))
ITEM(DisplayableBoardSlotPos, offsetof(DisplayableBoard, slot_pos))

ITEM(SlotPosSize, sizeof(SlotPos))
ITEM(SlotPosX, offsetof(SlotPos, x))
ITEM(SlotPosY, offsetof(SlotPos, y))

ITEM(GameBoardNumSlots, offsetof(GameBoard, num_slots))
ITEM(GameBoardAdj, offsetof(GameBoard, adj))

ITEM(SlotNodePtrSize, sizeof(SlotNode *))
ITEM(SlotNodeSlotId, offsetof(SlotNode, slot_id))
ITEM(SlotNodeNext, offsetof(SlotNode, next))

ITEM(PatternNodePattern, offsetof(PatternNode, pattern))
ITEM(PatternNodeNext, offsetof(PatternNode, next))

ITEM(PatternOtherId, offsetof(Pattern, other_id))
ITEM(PatternList, offsetof(Pattern, list))

ITEM(AIDecisionChoiceId, offsetof(AIDecision, choice_id))
ITEM(AIDecisionSlotId, offsetof(AIDecision, slot_id))
