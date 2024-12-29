#include "lunar_game.h"
#include <math.h>

// Initial number of entries in hash bucket
#define INIT_ENTRIES 16

// Rehash when size / number of entries >= this number
#define REHASH_THRESHOLD 0.7f
// After rehashing, keep that ratio under this number
#define REHASH_TO 0.4f

HashMap *HashMap_New(HashFunc hash, EqFunc eq, void *meta) {
    HashMap *map = (HashMap *) malloc(sizeof(HashMap));
    map->hash = hash;
    map->eq = eq;
    map->meta = meta;
    map->capacity = INIT_ENTRIES;
    map->size = 0;
    map->buckets = (HashPair **) malloc(sizeof(HashPair *) * INIT_ENTRIES);
    for (int i = 0; i < INIT_ENTRIES; ++i) {
        map->buckets[i] = NULL;
    }
    return map;
}

void HashMap_Delete(HashMap *map) {
    for (int i = 0; i < map->capacity; ++i) {
        HashPair *node = map->buckets[i];
        while (node != NULL) {
            HashPair *next = node->next;
            free(node);
            node = next;
        }
    }
    free(map->buckets);
    free(map);
}

static void map_insert(HashMap *map, HashPair *pair) {
    /* UB if `map` already has `key`. */
    const int index = map->hash(pair->key, map->meta) % map->capacity;
    map->size++;
    HashPair **entry = &map->buckets[index];
    pair->next = *entry;
    *entry = pair;
}

static void map_rehash(HashMap *map) {
    const int new_capacity = ceilf(map->size / REHASH_TO);
    HashPair **old_buckets = map->buckets;
    const int old_capacity = map->capacity;
    map->capacity = new_capacity;
    map->buckets = (HashPair **) malloc(sizeof(HashPair *) * new_capacity);
    for (int i = 0; i < new_capacity; ++i) {
        map->buckets[i] = NULL;
    }
    for (int i = 0; i < old_capacity; ++i) {
        HashPair *node = old_buckets[i];
        while (node != NULL) {
            HashPair *next = node->next;
            map_insert(map, node);
            node = next;
        }
    }
    free(old_buckets);
}

void HashMap_Insert(HashMap *map, void *key, void *value) {
    /* UB if `map` already has `key`. */
    if ((float) map->size / map->capacity > REHASH_THRESHOLD) {
        map_rehash(map);
    }
    HashPair *new_pair = (HashPair *) malloc(sizeof(HashPair));
    new_pair->key = key;
    new_pair->value = value;
    map_insert(map, new_pair);
}

static HashPair *map_get(const HashMap *map, void *key) {
    /* Return NULL if not found. */
    const int index = map->hash(key, map->meta) % map->capacity;
    HashPair *entry = map->buckets[index];
    while (entry != NULL && !map->eq(entry->key, key, map->meta)) {
        entry = entry->next;
    }
    return entry;
}

void *HashMap_Get(const HashMap *map, void *key) {
    /* UB if `map` does not have `key`. */
    return map_get(map, key)->value;
}

void HashMap_Set(HashMap *map, void *key, void *value) {
    /* UB if `map` does not have `key`. */
    map_get(map, key)->value = value;
}

void *HashMap_GetOr(const HashMap *map, void *key, void *default_) {
    /* Return `default_` if `map` does not have `key`. */
    const HashPair *entry = map_get(map, key);
    return entry == NULL ? default_ : entry->value;
}

bool HashMap_Has(const HashMap *map, void *key) {
    return map_get(map, key) != NULL;
}
