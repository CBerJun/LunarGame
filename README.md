# Rise of the Half Moon Clone

**NOTE: WORK IN PROGRESS. DON'T BELIEVE IN THIS README YET.**

This is a clone of Google's Doodle [Rise of the Half Moon][doodle1], which is a
**lunar-themed board game**. I found this game quite fun so I decided to
recreate it.

It is, in fact, not just one Doodle, but a monthly series of Doodles. Every
month when the lunar turns into the "Final Quarter" phase, Google publishes a
new version of the game. The core game logic, however, is the same in each of
these versions. As of writing this, Google has published four versions:
[October 24][doodle1], [November 21][doodle2], [December 22][doodle3] of 2024,
and [January 23][doodle4] of 2025.

[doodle1]: https://doodles.google/doodle/rise-of-the-half-moon/
[doodle2]: https://doodles.google/doodle/rise-of-the-half-moon-november/
[doodle3]: https://doodles.google/doodle/rise-of-the-half-moon-december/
[doodle4]: https://doodles.google/doodle/celebrating-the-rise-of-the-half-moon-jan/

## [Play the Game in Your Browser!][demo]

* **Mobile screens are supported.**
* Don't know this game yet? No worry, there is a **tutorial** in-game!

[demo]: https://example.com/

## Features

* **Core game logic** (*You don't have to read this!* There is a tutorial
  in-game!)
  - Game board consists of slots and edges that connect the slots.
  - You and the computer take turn placing cards.
  - Each card has one of the eight lunar phases on it.
  - Before each turn you draw one random card so that you have three cards to
    choose from. You can place the card on any empty slot.
  - The goal is to score by forming patterns when you place the cards:
    * **Phase Pair**: adjacent cards of the same phase. Worth 1 point.
    * **Full Moon Pair**: adjacent cards of opposite phases. Worth 2 points.
    * **Lunar Cycle**: 3 or more consecutive cards that follow the lunar cycle.
      Point is equal to the number of cards in the cycle.
    * Every card involved in a pattern will be *claimed* by the player that
      makes the pattern. The opposite player can claim a card back by making
      another match using that card.
  - The game ends when the board is completely filled with cards.
  - Each claimed card gives 1 point to the corresponding owner. Unclaimed cards
    are ignored.
  - The player with a higher score wins!
* **AI opponent** who plays the game quite well
  - It works by simulating the game for a few turns, trying out different moves
    and analyzing which is the best. Higher simulation depth means higher
    difficulty.
  - The difficulty setting is hidden in "Custom Game".
    * **Easy**: 50% of the time the AI plays greedily; 50% of the time it plays
      completely at random.
    * **Medium**: The AI always plays greedily. That means it uses whichever
      move that gets it the highest score and claims it the most number of
      cards at this step, without considering next step. I'd say this is about
      **the hardness of the AI in Google's original game.**
    * **Hard**: The AI considers what you are going to do after its move.
    * **Harder**: The AI considers what it's going to do after you make your
      move. It also takes into consider the randomness of drawing a card, and
      what cards will be left after this move.
      **At this level the AI is able to win most of the games against me.**
    * If the AI is run natively (instead of in browser) it can be much faster
      and hence higher difficulty is possible.
  - In a normal (non-custom) game, the AI starts off at the Easy level. It
    **becomes stronger** every 3 levels.
  - It does not cheat! The card it draws is completely random, and it does not
    know what cards you have in your hand, just like how *you* get random cards
    and cannot see the computer's cards. If it keeps winning, then it's just
    **smart**!
  - It can handle game boards with any shapes!
  - It always assumes that you will make the best move (well, the "best" in the
    AI's opinion) and you won't play any wildcard.
  - It will consider the effect of wildcards that you've already played.
* Web page **UI**
  - I spent a long time on **animations/transitions**!
* **All 12 game boards** from the October game
* **Wildcards** from October, November, December and January versions of the
  game:
  - October
    * **Hunter Moon**: destroy all cards controlled by the computer on the
      board.
    * **Super Moon**: makes your Full Moon Pairs worth double for the current
      level.
    * **Scorpio**: the computer gets no bonus points at the end of the current
      level.
    * **Leonids Meteor Shower**: destroys 2 random cards on the board.
  - November
    * **Winter Solstice**: your claimed cards can not be stolen for the current
      level.
    * **Beaver Moon**: flips a card on the board horizontally, or change New
      Moons into Full Moons and vice versa. If that helps you form patterns,
      you get points and claim the cards as normal.
    * **Sagittarius**: the next match you make will be worth triple points. If
      you make multiple matches in one move, all get tripled.
    * **Geminid Meteor Shower**: lets you claim half of the computer's claimed
      cards on the board.
  - December
    * **Long Night Moon**: the computer gets no bonus points at the end of the
      current level. (Same as Scorpio from October)
    * **Quadrantids Meteor Shower**: randomly destroys half the cards on the
      board.
    * **Light of Mars**: makes your Lunar Cycles worth +2 points for the
      current level.
    * **Capricorn**: lets you place your card on top of another card on the
      board for your current turn.
  - January:
    * **Aquarius**: get 10 extra points at the end of current level.
    * **Light of Venus**: get 1 extra point for each card you've claimed at the
      end of current level.
    * **Moon at Apogee**: makes all of the computer's matches worth 1 point for
      the current level.
    * **Wolf Moon**: choose 1 of the cards claimed by the computer to destroy
      that card and all cards that are directly connected to it and claimed by
      the computer.

## Technical Details

The backend of the project is written in C99. It is also written in such a way
that it is compatible with C++11. The backend is compiled into
[WebAssembly][wasm] using [Emscripten][emscripten] so that it can run in a
browser, and the frontend is written in JavaScript/HTML/CSS. The backend was
not written in JavaScript because an AI would require a lot of computations and
I want the speed of C/WebAssembly.

The most technical part of this game is the AI part. It follows the idea of the
**expectiminimax algorithm**. The alpha-beta pruning optimization cannot be
directly applied since our game contains "chance nodes" so I applied it
partially to only the min/max nodes. Taking existing cards in hand into
consideration significantly increased computation time but luckily I figured
out a way to cache some of the results that don't depend on the cards in hand
to improve the performance. At last it turned out that the pruning optimization
was easy and cheap but brings just a little improvement; while the caching,
though sophisticated, helped *a lot*.

Another tough spot is the lunar cycle detection algorithm. Graph searching
algorithm is needed. The logic may seem simple at first, but there are many
cases that need to be taken care of, especially when multiple cycles are
triggered by one card.

Additionally, the build script is written in Python. A little preprocessing was
also done in the build script in order to connect the frontend and the backend.

[wasm]: https://webassembly.org/
[emscripten]: https://emscripten.org/

## Building from Source

Dependencies:

* [Python](https://www.python.org/) 3.6 or above
* [Node.js](https://nodejs.org/)
* [Emscripten][emscripten]

Follow these steps:

1. Make sure the tools provided by these dependencies are accessible directly
   in command line. (i.e. add the correct thing to `PATH` environment variable)
2. `cd` into `src/frontend` and run `npm install`. This requires network
   connection.
3. `cd` back to the project root and execute `build.py` (`python build.py` or
   `python3 build.py` depending on your OS)
4. The game is ready under `dist/` directory. Run it using
   `python -m http.server -d dist` and play the game in your browser at
   `http://localhost:8000/`.

## Originality

The *game design* credit goes to Google. However, all the code and assets in
this repo were created by me. You may find, for example, the card textures in
my clone quite similar to Google's; but if you look closely, they are quite
different as my cards were flexible SVGs while Google's were PNGs.
