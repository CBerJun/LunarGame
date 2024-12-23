# Rise of the Half Moon Clone

**NOTE: WORK IN PROGRESS. DON'T BELIEVE IN THIS README YET.**

This is a clone of Google's Doodle [Rise of the Half Moon][doodle1], which is a
**lunar-themed board game**. I found this game quite fun so I decided to
recreate it.

It is, in fact, not just one Doodle, but a monthly series of Doodles. Every
month when the lunar turns into the "Final Quarter" phase, Google publishes a
new version of the game. The core game logic, however, is the same in each of
these versions. As of writing this, Google has published three versions:
[October 24][doodle1], [November 21][doodle2] and [December 22][doodle3] of
2024.

[doodle1]: https://doodles.google/doodle/rise-of-the-half-moon/
[doodle2]: https://doodles.google/doodle/rise-of-the-half-moon-november/
[doodle3]: https://doodles.google/doodle/rise-of-the-half-moon-december/

## Features

* Core game logic (*You don't have to read this!* There is a tutorial in-game!)
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
* AI opponent who plays the game quite well
  - Different difficulties are available!
  - It works by simulating the game for a few turns, trying out different moves
    and analyzing which is the best.
  - It always assumes that you make the best move (well, the "best" in the AI's
    opinion).
  - It always makes the best move (again, in its opinion, based on the
    simulation it had done)
* Web page UI
* All 12 game boards from the October game
* Wildcards from October, November and December versions of the game:
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
    * **Sagittarius**: the next match you make will be worth triple points.
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

## Technical Details

The backend of the project is written in C99. It is also written in such a way
that it is compatible with C++11. The backend will be compiled into
[WebAssembly][wasm] so that it can run in a browser, and the frontend is
written in JavaScript/HTML/CSS.

[wasm]: https://webassembly.org/

## Originality

The *game design* credit goes to Google. However, all the code and assets in
this repo were created by me. You may find, for example, the card textures in
my clone quite similar to Google's; but if you look closely, they are quite
different as my cards were flexible SVGs while Google's were PNGs.
