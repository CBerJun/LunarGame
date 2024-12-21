#include "lunar_game.h"
#include <limits.h>
#include <string.h>

typedef unsigned char Byte;

BitSet *BitSet_New(int bits) {
    /* `bits` must be nonnegative */
    BitSet *bs = (BitSet *) malloc(sizeof(BitSet));
    div_t d = div(bits, CHAR_BIT);
    bs->bits = bits;
    bs->bytes = d.quot + (d.rem > 0);
    bs->data = (Byte *) malloc(bs->bytes);
    if (bits) {
        // Set the last byte to 0 for the convenience when comparing
        // or hashing bit sets.
        bs->data[bs->bytes - 1] = 0u;
    }
    return bs;
}

void BitSet_Delete(BitSet *bs) {
    free(bs->data);
    free(bs);
}

static div_t bit_location(int index) {
    div_t d = div(index, CHAR_BIT);
    d.rem = CHAR_BIT - 1 - d.rem;
    return d;
}

bool BitSet_Get(const BitSet *bs, int index) {
    div_t loc = bit_location(index);
    return bs->data[loc.quot] & (1u << loc.rem);
}

void BitSet_Set(BitSet *bs, int index) {
    div_t loc = bit_location(index);
    bs->data[loc.quot] |= (1u << loc.rem);
}

void BitSet_Zero(BitSet *bs) {
    memset(bs->data, 0, bs->bytes);
}

void BitSet_Unset(BitSet *bs, int index) {
    div_t loc = bit_location(index);
    bs->data[loc.quot] &= ~(1u << loc.rem);
}

bool BitSet_Equal(const BitSet *bs1, const BitSet *bs2) {
    return (
        bs1->bits == bs2->bits
        && !memcmp(bs1->data, bs2->data, bs1->bytes)
    );
}

Hash BitSet_Hash(const BitSet *bs) {
    /*
     * This hash function works the best when all bit sets in your hash
     * map are equal length.
     */
    const int effective_bytes =
        sizeof(Hash) < bs->bytes ? sizeof(Hash) : bs->bytes;
    Hash res = 0;
    for (int i = 0; i < effective_bytes; ++i) {
        res <<= CHAR_BIT;
        res |= bs->data[i];
    }
    return res;
}
