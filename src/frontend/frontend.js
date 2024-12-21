import getBackend from "./backend.js";

getBackend()
    .then((backend) => {
        // These are all test code for now...
        const game = backend._Glue_NewLunarGame();
        backend._Glue_Free(game);
        fetch("card.svg")
            .then((res) => res.text())
            .then((text) => {
                const cardSvg = new DOMParser()
                    .parseFromString(text, "image/svg+xml");
                const gameBoard = document.getElementById("game-board");
                gameBoard.append(cardSvg.documentElement);
            });
    })
    .catch((reason) => {
        console.error(reason);
    });
