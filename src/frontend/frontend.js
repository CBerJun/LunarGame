import getBackend from "./backend.js";
import {Boards} from "./boards.js";

const moonPhases = [
    // Must follow the order in src/backend/lunar_game.h
    // Based on the fact that MP_NEW_MOON == 0
    "new-moon",
    "waxing-crescent",
    "first-quarter",
    "waxing-gibbous",
    "full-moon",
    "waning-gibbous",
    "final-quarter",
    "waning-crescent",
];

function clearChildren(element) {
    while (element.firstChild) {
        element.lastChild.remove();
    }
}

let currentScene;

function enterScene(scene) {
    if (currentScene) {
        document.getElementById(currentScene)
            .classList.toggle("visible", false);
    }
    currentScene = scene;
    document.getElementById(scene).classList.toggle("visible", true);
}

enterScene("loading-scene");

let cardSvg;
let starSvg;

function newCard() {
    return cardSvg.cloneNode(true);
}
function newStar() {
    return starSvg.cloneNode(true);
}

let loadingAnimCard;
let loadingAnimSchedule;
let loadingAnimState;

const bestRecordText = document.getElementById("best-record-text");

// "lunar-record" localStorage is a JSON
// {stars: number, level: number}

function updateRecordText(record) {
    clearChildren(bestRecordText);
    if (record == null) {
        bestRecordText.textContent =
            'Looks like this is your first time playing! Click on "Tutorial"'
            + " to learn how to play.";
    }
    else {
        bestRecordText.append(
            `High score: ${record.stars}`,
            document.createElement("br"),
            `Level reached: ${record.level}`,
        );
    }
}

let backend;

fetch("card.svg")
    .then(res => res.text())
    .then(text => {
        cardSvg = new DOMParser()
            .parseFromString(text, "image/svg+xml").documentElement;
        // Start the loading animation:
        loadingAnimCard = newCard();
        loadingAnimCard.classList.add("gray");
        document.getElementById("loading-card-wrapper")
            .append(loadingAnimCard);
        loadingAnimState = 0;
        loadingAnimSchedule = setInterval(() => {
            const c = loadingAnimCard.classList;
            c.remove(moonPhases[loadingAnimState]);
            ++loadingAnimState;
            loadingAnimState %= moonPhases.length;
            c.add(moonPhases[loadingAnimState]);
        }, 200);
        return fetch("star.svg");
    })
    .then(res => res.text())
    .then(text => {
        starSvg = new DOMParser()
            .parseFromString(text, "image/svg+xml").documentElement;
        return getBackend();
    })
    .then(backend2 => {
        backend = backend2;
        clearInterval(loadingAnimSchedule);  // Turn off animation loop
        enterScene("menu-scene");
        const record = localStorage.getItem("lunar-record");
        updateRecordText(record ? JSON.parse(record) : null);
        const blackStar = newStar();
        blackStar.classList.add("black");
        const whiteStar = newStar();
        whiteStar.classList.add("white");
        document.getElementById("lunar-score-icon").append(blackStar);
        document.getElementById("user-score-icon").append(whiteStar);
    })
    .catch(reason => {
        console.error(reason);
        document.getElementById("loading-text").textContent =
            "Oops... An error occurred when loading the game: " + reason
    });

const gameBoardDiv = document.getElementById("game-board");

class Game {
    constructor() {
        this.edgesSvg = document.createElementNS(
            "http://www.w3.org/2000/svg", "svg"
        );
        gameBoardDiv.append(this.edgesSvg);
        this.displayable_board = backend._Glue_NewDisplayableBoard();
        backend._Glue_InitDisplayableBoard(
            this.displayable_board, Boards.ThreeByThree
        );
        console.log(this.displayable_board);
    }
    uninstall() {
        backend._Glue_Free(this.displayable_board);
        clearChildren(gameBoardDiv);
    }
}

let game;

export function onTutorial() {}
export function onPlay() {
    enterScene("game-scene");
    game = new Game();
}
export function onCustomGame() {}
export function onExitGame() {
    game.uninstall();
    game = undefined;  // For GC
    enterScene("menu-scene");
}
