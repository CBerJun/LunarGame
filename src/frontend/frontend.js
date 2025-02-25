import getBackend from "./backend.js";
import {Boards} from "./boards.js";
import {BackendConstNames} from "./backend_consts.js";

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

let currentScene = null;

function enterScene(scene) {
    if (currentScene) {
        document.getElementById(currentScene).classList.remove("visible");
    }
    currentScene = scene;
    if (scene) {
        document.getElementById(scene).classList.add("visible");
    }
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

let record = null;

function tryUpdateRecord(newRecord) {
    let updated = false;
    if (record == null) {
        record = newRecord;
        updated = true
    }
    else {
        if (newRecord.stars > record.stars) {
            updated = true;
            record.stars = newRecord.stars;
        }
        if (newRecord.level > record.level) {
            updated = true;
            record.level = newRecord.level;
        }
    }
    if (updated) {
        localStorage.setItem("lunar-record", JSON.stringify(record));
    }
    return updated;
}

function updateRecordText() {
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

function externalSvg(url) {
    return new Promise((resolve) => {
        fetch(url)
            .then(res => res.text())
            .then(text => resolve(
                new DOMParser().parseFromString(text, "image/svg+xml")
                .documentElement
            ))
    });
}

let backend;
let backendConst = {};
let int;
let blackStarIcon;
let whiteStarIcon;
let AIMove;

externalSvg("images/card.svg")
    .then(cardSvg2 => {
        cardSvg = cardSvg2;
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
        return externalSvg("images/star.svg");
    })
    .then(starSvg2 => {
        starSvg = starSvg2;
        return getBackend();
    })
    .then(backend2 => {
        backend = backend2;
        const constsAddr = backend._Glue_IntConstants();
        for (const [i, constName] of BackendConstNames.entries()) {
            backendConst[constName] = backend.getValue(
                // 4 bytes in a i32; 8 bits/byte is guaranteed in
                // WebAssembly.
                constsAddr + i * 4, 'i32'
            );
        }
        int = 'i' + backendConst.IntSize * 8;
        if (int != 'i16' && int != 'i32') {
            throw "unexpected sizeof(int): " + backendConst.IntSize;
        }
        const ptr = "number";
        AIMove = backend.cwrap(
            "Glue_AIMove", ptr, [ptr, ptr, "number", "number"],
            {async: true}
        );
        clearInterval(loadingAnimSchedule);  // Turn off animation loop
        enterScene("menu-scene");
        const recordStr = localStorage.getItem("lunar-record");
        record = recordStr ? JSON.parse(recordStr) : null;
        updateRecordText();
        blackStarIcon = newStar();
        blackStarIcon.classList.add("black");
        whiteStarIcon = newStar();
        whiteStarIcon.classList.add("white");
        document.getElementById("lunar-score-icon").append(blackStarIcon);
        document.getElementById("user-score-icon").append(whiteStarIcon);
    })
    .catch(reason => {
        console.error(reason);
        document.getElementById("loading-text").textContent =
            "Oops... An error occurred when loading the game: " + reason
    });

function hashEdge(id1, id2) {
    if (id1 > id2) {
        [id1, id2] = [id2, id1];
    }
    return `${id1},${id2}`;
}

function svgNode(tag) {
    return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

class RenderedEdge {
    constructor(pos1, pos2, slot1Id) {
        this.pos1 = pos1;
        this.pos2 = pos2;
        this.slot1Id = slot1Id;
        this.symbol = null;
    }
}

const gameSceneDiv = document.getElementById("game-scene");
const edgesSvg = document.getElementById("edges");
const slotsDiv = document.getElementById("game-board-slots");
const gameFloatingLayerDiv = document.getElementById("game-floating-layer");
const userCardsDiv = document.getElementById("user-cards-placeholder");
const lunarCardsDiv = document.getElementById("lunar-cards-placeholder");
const userHandDiv = document.getElementById("user-hand");
const lunarHandDiv = document.getElementById("lunar-hand");
const gameBoardCardsDiv = document.getElementById("game-board-cards");
const cardSelectionBox = document.getElementById("user-card-selection-box");
const userScoreText = document.getElementById("user-score-text");
const lunarScoreText = document.getElementById("lunar-score-text");
const dialogueBox = document.getElementById("dialogue-box");
const dialogueContent = document.getElementById("dialogue-content");
const starsDiv = document.getElementById("stars");
const exitButton = document.getElementById("exit-button");
const wildcardsButton = document.getElementById("wildcards-button");
const aiLevelSelect = document.getElementById("ai-level-select");
const gameBoardSelect = document.getElementById("game-board-select");
const whoStartsSelect = document.getElementById("who-starts-select");

const slotButtonSize = 5.25;  // gh
const cardSize = slotButtonSize * 1.48;
const cardGap = cardSize * 0.2;
const lunarCard2CardScale = 1.35;
const lunarCardSize = cardSize / lunarCard2CardScale;
// TODO don't hard code these...
const bonusStarInitialPad = 10;  // gh
const bonusStarGap = 4;  // gh
const largeCardScale = 1.2;

const halfSlotButtonSize = slotButtonSize / 2;
const halfCardSize = cardSize / 2;
const halfLunarCardSize = lunarCardSize / 2;

function gh(x) {
    // 1% of div#game-wrapper height is 1gh.
    return `calc(${x} * var(--gh))`;
}

const extraStyle = document.createElement("style");
extraStyle.textContent = `
div#game-board-slots > button {
    width: ${gh(slotButtonSize)};
    height: ${gh(slotButtonSize)};
}
div#game-board {
    padding: ${gh(halfSlotButtonSize)} 0;
}
div#user-cards-placeholder {
    height: ${gh(cardSize)};
    /* width is dynamic */
}
div#lunar-cards-placeholder {
    height: ${gh(lunarCardSize)};
    /* width is dynamic */
}
div#user-hand > svg.card,
div#game-board-cards > svg.card {
    width: ${gh(cardSize)};
}
div#lunar-hand > svg.card {
    width: ${gh(lunarCardSize)};
}
svg#user-card-selection-box {
    width: ${gh(cardSize)};
}
`;
document.head.append(extraStyle);

cardSelectionBox.style.opacity = "0";
dialogueBox.style.opacity = "0";

function randomInt(below) {
    return Math.floor(Math.random() * below);
}
function randomPhase() {
    return randomInt(moonPhases.length);
}
function randomBoard() {
    return randomInt(Boards.length);
}
function randomChoose(items, k) {
    if (items.length < k) {
        throw new RangeError();
    }
    const pool = items.map(item => [Math.random(), item]);
    pool.sort((a, b) => a[0] - b[0]);
    const res = [];
    for (let i = 0; i < k; ++i) {
        res.push(pool[i][1]);
    }
    return res;
}
function randomChooseHalf(items) {
    return randomChoose(items, Math.ceil(items.length / 2));
}
function rangeFilter(n, predicate) {
    const res = [];
    for (let i = 0; i < n; ++i) {
        if (predicate(i)) {
            res.push(i);
        }
    }
    return res;
}

const ABORTED = new Error("ABORTED");

function sleep(ms, abortSignal=null) {
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timeOutToken);
            reject(ABORTED);
        };
        const timeOutToken = setTimeout(() => {
            if (abortSignal != null) {
                abortSignal.removeEventListener("abort", onAbort);
            }
            resolve(undefined);
        }, ms);
        if (abortSignal != null) {
            abortSignal.addEventListener("abort", onAbort);
        }
    });
}

function showDialogueBox(text, abortSignal=null) {
    dialogueContent.textContent = text;
    return runAnimation(200, abortSignal, new FadeIn(dialogueBox));
}

async function updateDialogueText(abortSignal, ...components) {
    await runAnimation(100, abortSignal, new FadeOut(dialogueContent));
    clearChildren(dialogueContent);
    dialogueContent.append(...components);
    await runAnimation(100, abortSignal, new FadeIn(dialogueContent));
}

async function hideDialogueBox(abortSignal=null) {
    await runAnimation(200, abortSignal, new FadeOut(dialogueBox));
    dialogueContent.textContent = "";
}

function linear(x) {
    return x;
}
function easeInOutSine(x) {
    return -(Math.cos(Math.PI * x) - 1) / 2;
}
function easeOutQuad(x) {
    return 1 - (1 - x) * (1 - x);
}

class Animation {
    constructor(easingFunc) {
        this.easingFunc = easingFunc;
    }
    run(progress) {
        throw "not implemented";
    }
}
class FromTo extends Animation {
    constructor(from, to, easingFunc) {
        super(easingFunc);
        this.from = from;
        this.to = to;
    }
    _run(value) {
        throw "not implemented";
    }
    run(progress) {
        this._run(this.from + (this.to - this.from) * progress);
    }
}
class Scale extends FromTo {
    constructor(element, to, from=1.0, easingFunc=linear) {
        super(from, to, easingFunc);
        this.element = element;
    }
    _run(value) {
        this.element.style.transform = `scale(${value})`;
    }
}
class Translate extends FromTo {
    constructor(element, from, to, easingFunc=easeInOutSine) {
        super(from, to, easingFunc);
        this.element = element;
    }
}
class TranslateX extends Translate {
    _run(value) {
        this.element.style.left = gh(value);
    }
}
class TranslateY extends Translate {
    _run(value) {
        this.element.style.top = gh(value);
    }
}
class Fade extends FromTo {
    constructor(element, from, to, easingFunc=linear) {
        super(from, to, easingFunc);
        this.element = element;
    }
    _run(value) {
        this.element.style.opacity = String(value);
    }
}
class FadeIn extends Fade {
    constructor(element, easingFunc=linear) {
        super(element, 0, 1, easingFunc);
    }
}
class FadeOut extends Fade {
    constructor(element, easingFunc=linear) {
        super(element, 1, 0, easingFunc);
    }
}
class RotateY extends FromTo {
    constructor(element, from, to, easingFunc=linear) {
        super(from, to, easingFunc);
        this.element = element;
    }
    _run(value) {
        this.element.style.transform = `rotateY(${value}deg)`;
    }
}
class FlipCard1 extends RotateY {
    constructor(element, easingFunc=linear) {
        super(element, 0, 90, easingFunc);
    }
}
class FlipCard2 extends RotateY {
    constructor(element, easingFunc=linear) {
        super(element, 90, 0, easingFunc);
    }
}
class DrawLine extends Animation {
    constructor(svgLine, pos1, pos2, easingFunc=linear) {
        super(easingFunc);
        this.svgLine = svgLine;
        [this.x, this.y] = pos1;
        this.dx = pos2[0] - pos1[0];
        this.dy = pos2[1] - pos1[1];
    }
    run(progress) {
        this.svgLine.setAttribute("x2", this.x + this.dx * progress);
        this.svgLine.setAttribute("y2", this.y + this.dy * progress);
    }
}
class Count extends FromTo {
    constructor(element, from, to, easingFunc=linear) {
        super(from, to, easingFunc);
        this.element = element;
    }
    _run(value) {
        this.element.textContent = String(Math.round(value));
    }
}

function runAnimation(durationMs, abortSignal, ...animations) {
    function invokeAnimations(progress) {
        for (const animation of animations) {
            animation.run(animation.easingFunc(progress));
        }
    }
    // Invoke with 0% progress immediately once. The user must not see
    // the state of the object between when `runAnimation` is called and
    // when `requestAnimationFrame` calls us back.
    invokeAnimations(0.0);
    return new Promise((resolve, reject) => {
        let start;
        function draw(timestamp) {
            if (abortSignal != null && abortSignal.aborted) {
                reject(ABORTED);
            }
            if (start == undefined) {
                start = timestamp;
            }
            const progress = Math.min(1.0, (timestamp - start) / durationMs);
            invokeAnimations(progress);
            if (progress < 1.0) {
                window.requestAnimationFrame(draw);
            }
            else {
                resolve(undefined);
            }
        }
        window.requestAnimationFrame(draw);
    });
}

async function fadeOutCurrentScene() {
    const sceneDiv = document.getElementById(currentScene);
    sceneDiv.classList.add("fading");
    await runAnimation(500, null, new FadeOut(sceneDiv));
    sceneDiv.classList.remove("visible", "fading");
    currentScene = null;
}

async function enterSceneAnimated(scene) {
    if (currentScene) {
        throw "currentScene != undefined";
    }
    currentScene = scene;
    const sceneDiv = document.getElementById(scene);
    sceneDiv.classList.add("visible", "fading");
    await runAnimation(500, null, new FadeIn(sceneDiv));
    sceneDiv.classList.remove("fading");
}

class CardInHand {
    constructor(element, phase, onclick=null) {
        this.element = element;
        this.phase = phase;
        this.onclick = onclick;
    }
}

class BoardSlot {
    constructor(centerPosXGh, centerPosYGh, button) {
        this.centerPosXGh = centerPosXGh;
        this.centerPosYGh = centerPosYGh;
        this.button = button;
        this.card = null;
        this.cardColor = null;
        this.phase = null;
    }
    setCardColor(color) {
        if (color != this.cardColor) {
            this.card.classList.remove(this.cardColor);
            this.card.classList.add(color);
            this.cardColor = color;
        }
    }
}

class DisplayedStar {
    constructor(star, x, y) {
        this.star = star;
        this.x = x;
        this.y = y;
    }
}

let dialogueBoxInitialized = false;

function newLunarCycleSymbol() {
    const node = svgNode("line");
    node.classList.add("lunar-cycle-symbol");
    edgesSvg.append(node);
    return node;
}

const AILevel = {
    WEAK: -1,
    // >0 values correspond to depth of search passed to C backend
    GREEDY: 1,
    SMART: 2,
    // 3 has the same effect as 2
    SMARTER: 4,
};
const aiLevelDisplayNames = {
    WEAK: "Easy",
    GREEDY: "Medium",
    SMART: "Hard",
    SMARTER: "Even Harder",
};

// Populate AI level select box
const customGameDefaultAILevel = "GREEDY";
Object.getOwnPropertyNames(AILevel).forEach(id => {
    const opt = document.createElement("option");
    opt.textContent = aiLevelDisplayNames[id];
    opt.value = String(AILevel[id]);
    if (customGameDefaultAILevel == id) {
        opt.selected = true;
    }
    aiLevelSelect.append(opt);
});

// Populate game board select box
const customGameDefaultBoard = "ThreeByThree";
Object.getOwnPropertyNames(Boards).forEach(id => {
    if (id == "length") {
        return;
    }
    const opt = document.createElement("option");
    opt.textContent = id;
    opt.value = String(Boards[id]);
    if (customGameDefaultBoard == id) {
        opt.selected = true;
    }
    gameBoardSelect.append(opt);
});

class Game {
    constructor(aiLevel, boardType, cardsInAHand) {
        this.aiLevel = aiLevel;
        this.cardsInAHand = cardsInAHand;
        this.userGoesFirst = true;  // May be altered before calling controller
        const db = backend._malloc(backendConst.DisplayableBoardSize);
        this.displayableBoard = db;
        backend._Glue_InitDisplayableBoard(db, boardType);
        this.board = backend.getValue(
            db + backendConst.DisplayableBoardBoard, '*'
        );
        this.userCardSelection = null;
        this.userHandInputEnabled = false;
        this.emptySlotsInputEnabled = false;
        this.abortController = new AbortController();
        this.abortSignal = this.abortController.signal;
        this.cleanedDom = false;
        // Resize the placeholders
        userCardsDiv.style.width = gh(
            cardsInAHand * (cardSize + cardGap) - cardGap
        );
        lunarCardsDiv.style.width = gh(
            cardsInAHand * (lunarCardSize + cardGap) - cardGap
        );
        // Coordinate manipulation for the floating layer
        const px2gh = 100 / gameSceneDiv.clientHeight;
        const floatingLayerRect = gameFloatingLayerDiv.getBoundingClientRect();
        const userCardsRect = userCardsDiv.getBoundingClientRect();
        const lunarCardsRect = lunarCardsDiv.getBoundingClientRect();
        this.userCardsX = (userCardsRect.x - floatingLayerRect.x) * px2gh;
        this.lunarCardsX = (lunarCardsRect.x - floatingLayerRect.x) * px2gh;
        this.userCardsY = (userCardsRect.y - floatingLayerRect.y) * px2gh;
        this.lunarCardsY = (lunarCardsRect.y - floatingLayerRect.y) * px2gh;
        this.outsideScreenX = floatingLayerRect.width * px2gh;
        // Initialize dialogue box
        if (!dialogueBoxInitialized) {
            dialogueBoxInitialized = true;
            const wrapperRect =
                document.getElementById("lunar-cards-placeholder-wrapper")
                .getBoundingClientRect();
            dialogueBox.style.left = gh(
                (wrapperRect.x - floatingLayerRect.x) * px2gh);
            dialogueBox.style.top = gh(
                (wrapperRect.y - floatingLayerRect.y) * px2gh);
            dialogueBox.style.width = gh(wrapperRect.width * px2gh);
            dialogueBox.style.height = gh(wrapperRect.height * px2gh);
        }
        // Render the board
        this.numSlots = backend.getValue(
            this.board + backendConst.GameBoardNumSlots, int
        );
        const yLenNoPadding = backend.getValue(
            db + backendConst.DisplayableBoardYLen, int
        );
        this.eshToSvgPx = yLenNoPadding / 100;
        edgesSvg.style.setProperty("--esh", String(this.eshToSvgPx));
        // Q is the extra padding in edges SVG so that the phase pair or
        // half moon symbols aren't cut out of the SVG for edges that
        // are near the SVG border.
        const Q = 5 * this.eshToSvgPx;
        const xLen = backend.getValue(
            db + backendConst.DisplayableBoardXLen, int
        ) + 2 * Q;
        const yLen = yLenNoPadding + 2 * Q;
        let slotPosPtr = backend.getValue(
            db + backendConst.DisplayableBoardSlotPos, '*'
        );
        const slotPos = [];
        for (let i = 0; i < this.numSlots; ++i) {
            slotPos.push([
                backend.getValue(slotPosPtr + backendConst.SlotPosX, int),
                backend.getValue(slotPosPtr + backendConst.SlotPosY, int),
            ]);
            slotPosPtr += backendConst.SlotPosSize;
        }
        edgesSvg.setAttribute("viewBox", [-Q, -Q, xLen, yLen].join(" "));
        let adjPtr = backend.getValue(
            this.board + backendConst.GameBoardAdj, '*'
        );
        this.edges = new Map();  // `${x},${y}` -> <line> element
        this.slots = [];
        const svgRect = edgesSvg.getBoundingClientRect();
        const scaleX = svgRect.width / xLen * px2gh;
        const scaleY = svgRect.height / yLen * px2gh;
        const edgesOffsetX = (svgRect.x - floatingLayerRect.x) * px2gh
            + Q * scaleX;
        const edgesOffsetY = (svgRect.y - floatingLayerRect.y) * px2gh
            + Q * scaleY;
        this.adjList = [];
        for (let i = 0; i < this.numSlots; ++i) {
            const p1 = slotPos[i];
            // Vertex
            const centerPosX = edgesOffsetX + scaleX * p1[0];
            const centerPosY = edgesOffsetY + scaleY * p1[1];
            const button = document.createElement("button");
            this.slots.push(new BoardSlot(centerPosX, centerPosY, button));
            button.type = "button";
            button.addEventListener("click", (event) => {
                if (!this.emptySlotsInputEnabled || this.filterSlot(i)) {
                    return;
                }
                this.onUserPlaceCard(i);
            });
            button.style.left = gh(centerPosX - halfSlotButtonSize);
            button.style.top = gh(centerPosY - halfSlotButtonSize);
            const buttonIndicator = svgNode("svg");
            const indicatorRect = svgNode("rect");
            indicatorRect.classList.add("slot-indicator");
            buttonIndicator.append(indicatorRect);
            button.append(buttonIndicator);
            slotsDiv.append(button);
            // Edges
            const neighbors = [];
            this.adjList.push(neighbors);
            let node = backend.getValue(adjPtr, '*');
            while (!backend._Glue_IsNull(node)) {
                const slotId = backend.getValue(
                    node + backendConst.SlotNodeSlotId, int
                );
                neighbors.push(slotId);
                const hash = hashEdge(slotId, i);
                if (!this.edges.has(hash)) {
                    const p2 = slotPos[slotId];
                    const line = svgNode("line");
                    line.setAttribute("x1", String(p1[0]));
                    line.setAttribute("y1", String(p1[1]));
                    line.setAttribute("x2", String(p2[0]));
                    line.setAttribute("y2", String(p2[1]));
                    this.edges.set(hash, new RenderedEdge(p1, p2, i));
                    edgesSvg.append(line);
                }
                node = backend.getValue(node + backendConst.SlotNodeNext, '*');
            }
            adjPtr += backendConst.SlotNodePtrSize;
        }
        // Draw initial cards
        this.userHand = new Array(cardsInAHand).fill(null);
        this.lunarHand = new Array(cardsInAHand).fill(null);
        this.userPlayedCard = this.lunarPlayedCard = cardsInAHand - 1;
        // Misc...
        this.slotsFilled = 0;
        this.lunarScore = this.userScore = 0;
        this.perks = 0;
        this.aquarius = false;
        cardSelectionBox.style.top = gh(this.userCardsY);
        userScoreText.textContent = "0";
        lunarScoreText.textContent = "0";
        const blackStarRect = blackStarIcon.getBoundingClientRect();
        this.blackStarIconX = (blackStarRect.x - floatingLayerRect.x) * px2gh;
        this.blackStarIconY = (blackStarRect.y - floatingLayerRect.y) * px2gh;
        const whiteStarRect = whiteStarIcon.getBoundingClientRect();
        this.whiteStarIconX = (whiteStarRect.x - floatingLayerRect.x) * px2gh;
        this.whiteStarIconY = (whiteStarRect.y - floatingLayerRect.y) * px2gh;
    }
    showDialogueBox(text) {  // override-able
        return showDialogueBox(text, this.abortSignal);
    }
    hideDialogueBox() {  // override-able
        return hideDialogueBox(this.abortSignal);
    }
    runAnimation(durationMs, ...animations) {
        return runAnimation(durationMs, this.abortSignal, ...animations);
    }
    sleep(ms) {
        return sleep(ms, this.abortSignal);
    }
    async controller() {  // override-able
        await this.drawInitialCards();
        let userRound = this.userGoesFirst;
        if (!userRound) {
            this.computerStartThinking();
        }
        while (this.slotsFilled != this.slots.length) {
            await (userRound ? this.userRound() : this.computerRound());
            userRound = !userRound;
        }
        await this.endGameBonus();
        this.cleanup();
    }
    drawInitialCards() {
        const promises = [];
        for (let i = 0; i < this.cardsInAHand - 1; ++i) {
            this.prepareLunarCard(i);
            promises.push(this.dealUserCard(i), this.dealLunarCard(i));
        }
        return Promise.all(promises);
    }
    userCardX(cardIndex) {
        return this.userCardsX + cardIndex * (cardSize + cardGap);
    }
    lunarCardX(cardIndex) {
        return this.lunarCardsX + cardIndex * (lunarCardSize + cardGap);
    }
    updateUserCardSelection(cardIndex) {
        if (this.userCardSelection == cardIndex) {
            return;
        }
        this.userCardSelection = cardIndex;
        if (cardIndex == null) {
            cardSelectionBox.style.opacity = "0";
        }
        else {
            cardSelectionBox.style.opacity = "1";
            cardSelectionBox.style.left = gh(this.userCardX(cardIndex));
        }
    }
    async dealUserCard(cardIndex, phase=null) {
        if (phase == null) {
            phase = randomPhase();
        }
        const card = newCard();
        const onclick = (event) => {
            if (!this.userHandInputEnabled) {
                return;
            }
            this.updateUserCardSelection(cardIndex);
        };
        this.userHand[cardIndex] = new CardInHand(card, phase, onclick);
        card.classList.add("back");
        card.style.top = gh(this.userCardsY);
        card.addEventListener("click", onclick);
        userHandDiv.append(card);
        // Fly-in animation
        await this.runAnimation(400, new TranslateX(
            card, this.outsideScreenX, this.userCardX(cardIndex)
        ));
        // Flip card animation
        await this.runAnimation(150, new FlipCard1(card));
        card.classList.remove("back");
        card.classList.add("gray", moonPhases[phase]);
        await this.runAnimation(150, new FlipCard2(card));
    }
    prepareLunarCard(cardIndex, phase=null) {
        if (phase == null) {
            phase = randomPhase();
        }
        const card = newCard();
        this.lunarHand[cardIndex] = new CardInHand(card, phase);
        card.classList.add("back");
        card.style.top = gh(this.lunarCardsY);
    }
    dealLunarCard(cardIndex) {
        const card = this.lunarHand[cardIndex].element;
        lunarHandDiv.append(card);
        // Fly-in animation
        return this.runAnimation(400, new TranslateX(
            card, this.outsideScreenX,
            this.lunarCardX(cardIndex)
        ));
    }
    enableUserInput() {  // override-able
        this.userHandInputEnabled = true;
        this.emptySlotsInputEnabled = true;
        // Allow user to pick a card and place it
        slotsDiv.classList.add("enabled");
        userHandDiv.classList.add("enabled");
    }
    userRoundBegin() {  // override-able
        return this.dealUserCard(this.userPlayedCard);
    }
    showWildcards() {  // override-able
        return wildcardManager.wildcards.size > 0;
    }
    async userRound(onRecvUserMove=null) {
        await this.userRoundBegin();
        if (this.showWildcards()) {
            wildcardsButton.removeAttribute("disabled");
        }
        // Select the middle card by default
        this.updateUserCardSelection(Math.floor(this.cardsInAHand / 2));
        // Wait for user input
        this.enableUserInput();
        await new Promise((resolve, reject) => {
            this.userPlaceCardEndCallbacks = {resolve, reject};
            this.onRecvUserMove = onRecvUserMove;
        });
    }
    disableUserInput() {  // override-able
        this.userHandInputEnabled = false;
        this.emptySlotsInputEnabled = false;
        slotsDiv.classList.remove("enabled");
        userHandDiv.classList.remove("enabled");
    }
    computerStartThinking() {  // override-able
        this.prepareLunarCard(this.lunarPlayedCard);
        let aiDepth = this.aiLevel;
        if (aiDepth == AILevel.WEAK) {
            aiDepth = Math.random() >= 0.5 ? AILevel.GREEDY : 0;
        }
        this.didInvokeCAI = aiDepth > 0;
        if (this.didInvokeCAI) {
            const aiChoices =
                backend._malloc(this.cardsInAHand * backendConst.IntSize);
            for (let i = 0, ptr = aiChoices; i < this.cardsInAHand; ++i) {
                backend.setValue(ptr, this.lunarHand[i].phase, int);
                ptr += backendConst.IntSize;
            }
            this.aiPromise = AIMove(
                this.board, aiChoices, this.cardsInAHand, aiDepth
            );
            this.resolvedAIDecision = null;
            this.aiPromise.then((result) => {
                backend._free(aiChoices);
                this.resolvedAIDecision = result;
            });
            // Temporarily disable Exit button... It can lead to many
            // unexpected things when a C function is running.
            exitButton.setAttribute("disabled", "");
        }
        else {
            // Play randomly...
            const slotIds = [];
            for (const [i, slot] of this.slots.entries()) {
                if (slot.card == null) {
                    slotIds.push(i);
                }
            }
            this.resolvedAIDecision = [
                randomInt(this.cardsInAHand),
                slotIds[randomInt(slotIds.length)]
            ];
        }
    }
    filterSlot(slotId) {  // override-able
        return false;
    }
    onUserPlaceCard(slotId) {
        this.onUserPlaceCardInner(slotId)
            .then(this.userPlaceCardEndCallbacks.resolve)
            .catch(this.userPlaceCardEndCallbacks.reject)
            .finally(() => {
                this.userPlaceCardEndCallbacks = undefined;
            });
    }
    async onUserPlaceCardInner(slotId) {
        const card = this.userHand[this.userCardSelection];
        // Turn off input
        this.disableUserInput();
        if (this.showWildcards()) {
            wildcardsButton.setAttribute("disabled", "");
        }
        if (this.onRecvUserMove != null) {
            await this.onRecvUserMove();
        }
        this.userHand[this.userCardSelection] = null;
        this.userPlayedCard = this.userCardSelection;
        this.updateUserCardSelection(null);
        card.element.removeEventListener("click", card.onclick);
        const patterns = this.simplyPlaceUserCard(
            card.phase, slotId, card.element
        );
        if (this.slotsFilled != this.slots.length) {
            // As soon as the user plays their card, we could deal AI
            // the card (internally) and let it start thinking
            this.computerStartThinking();
        }
        const slot = this.slots[slotId];
        await this.runAnimation(500,
            new TranslateX(
                card.element, this.userCardX(this.userPlayedCard),
                slot.centerPosXGh - halfCardSize
            ),
            new TranslateY(
                card.element, this.userCardsY,
                slot.centerPosYGh - halfCardSize
            ),
        );
        // Move card from #user-hand to #game-board-cards
        gameBoardCardsDiv.append(card.element);
        await this.showAndDeletePatterns(patterns, slotId, "white");
    }
    simplyPlaceUserCard(phase, slotId, cardElement) {
        ++this.slotsFilled;
        const slot = this.slots[slotId];
        slot.card = cardElement;
        slot.cardColor = "gray";
        slot.phase = phase;
        return backend._Glue_PutCard(
            this.board, slotId, phase, backendConst.PlayerWhite
        );
    }
    async computerDecisionRequired() {  // override-able
        if (!this.didInvokeCAI) {
            return this.resolvedAIDecision;
        }
        const aiDecision = this.resolvedAIDecision ?? (await this.aiPromise);
        // C function has finished, resume exit button
        exitButton.removeAttribute("disabled");
        const cardIndex = backend.getValue(
            aiDecision + backendConst.AIDecisionCardId, int
        );
        const slotId = backend.getValue(
            aiDecision + backendConst.AIDecisionSlotId, int
        );
        backend._free(aiDecision);
        return [cardIndex, slotId];
    }
    async computerRound() {
        await this.dealLunarCard(this.lunarPlayedCard);
        const [cardIndex, slotId] = await this.computerDecisionRequired();
        ++this.slotsFilled;
        const card = this.lunarHand[cardIndex];
        const slot = this.slots[slotId];
        this.lunarHand[cardIndex] = null;
        this.lunarPlayedCard = cardIndex;
        // Scale and translate animation...
        slot.card = card.element;
        slot.cardColor = "gray";
        slot.phase = card.phase;
        await this.runAnimation(500,
            new TranslateX(
                card.element, this.lunarCardX(cardIndex),
                slot.centerPosXGh - halfLunarCardSize
            ),
            new TranslateY(
                card.element, this.lunarCardsY,
                slot.centerPosYGh - halfLunarCardSize
            ),
            new Scale(card.element, lunarCard2CardScale, 1.0, easeOutQuad),
        );
        // Move card from #lunar-hand to #game-board-cards
        gameBoardCardsDiv.append(card.element);
        // After that the scale effect needs to be removed because the
        // CSS will enlarge the width for us...
        card.element.style.removeProperty("transform");
        // ... and the position needs to be adjusted too
        card.element.style.left = gh(slot.centerPosXGh - halfCardSize);
        card.element.style.top = gh(slot.centerPosYGh - halfCardSize);
        // Flip card animation...
        await this.runAnimation(150, new FlipCard1(card.element));
        card.element.classList.remove("back");
        card.element.classList.add("gray", moonPhases[card.phase]);
        await this.runAnimation(150, new FlipCard2(card.element));
        const patterns = backend._Glue_PutCard(
            this.board, slotId, card.phase, backendConst.PlayerBlack
        );
        await this.showAndDeletePatterns(patterns, slotId, "black");
    }
    scaleCards(slotIds, bigger) {
        const [to, from] = bigger ? [largeCardScale, 1] : [1, largeCardScale];
        return Promise.all(slotIds.map(slotId => this.runAnimation(
            200, new Scale(this.slots[slotId].card, to, from)
        )));
    }
    async showStarAt(x, y, color) {
        const star = newStar();
        starsDiv.append(star);
        star.style.left = gh(x);
        star.style.top = gh(y);
        star.classList.add(color);
        await this.runAnimation(150, new FadeIn(star));
        return new DisplayedStar(star, x, y);
    }
    showStar(slotId, color) {
        const slot = this.slots[slotId];
        return this.showStarAt(
            slot.centerPosXGh - halfCardSize,
            slot.centerPosYGh - halfCardSize,
            color
        );
    }
    async showStars(slotIds, color, oneByOne=false) {
        if (oneByOne) {
            const stars = [];
            for (const slotId of slotIds) {
                stars.push(await this.showStar(slotId, color));
            }
            return stars;
        }
        else {
            return await Promise.all(slotIds.map(
                slotId => this.showStar(slotId, color)
            ));
        }
    }
    async hideStars(stars, color) {
        // stars is `DisplayedStar[]`
        const [scoreText, left, top, scoreProp] = color == "black" ?
            [
                lunarScoreText, this.blackStarIconX, this.blackStarIconY,
                "lunarScore"
            ] :
            [
                userScoreText, this.whiteStarIconX, this.whiteStarIconY,
                "userScore"
            ];
        for (const dStar of stars) {
            await this.runAnimation(300,
                new TranslateX(dStar.star, dStar.x, left),
                new TranslateY(dStar.star, dStar.y, top),
            );
            dStar.star.classList.add("display-none");
            scoreText.textContent = String(++this[scoreProp]);
        }
        clearChildren(starsDiv);
    }
    showBonusStars(bonus, color) {
        const y = color == "black" ? this.blackStarIconY
            : this.whiteStarIconY;
        const sign = color == "black" ? -1 : 1;
        let x = color == "black" ? this.blackStarIconX
            : this.whiteStarIconX;
        x += sign * bonusStarInitialPad;
        const promises = []
        for (let i = 0; i < bonus; ++i) {
            promises.push(this.showStarAt(x, y, color));
            x += sign * bonusStarGap;
        }
        return Promise.all(promises);
    }
    fullMoonSymbol(slot1, slot2) {
        const edge = this.edges.get(hashEdge(slot1, slot2));
        const symbol = svgNode("circle");
        edge.symbol = symbol;
        symbol.classList.add("full-moon-symbol");
        const [x1, y1] = edge.pos1;
        const [x2, y2] = edge.pos2;
        symbol.setAttribute("cx", (x1 + x2) / 2);
        symbol.setAttribute("cy", (y1 + y2) / 2);
        edgesSvg.append(symbol);
        return symbol;
    }
    phasePairSymbol(slot1, slot2) {
        const edge = this.edges.get(hashEdge(slot1, slot2));
        const symbol = svgNode("g");
        edge.symbol = symbol;
        symbol.classList.add("phase-pair-symbol");
        const [x1, y1] = edge.pos1;
        const [x2, y2] = edge.pos2;
        let [nx, ny] = [y1 - y2, x2 - x1];  // Normal vector
        const magnitude = Math.sqrt(nx * nx + ny * ny);
        nx /= magnitude;
        ny /= magnitude;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const positiveOffset = 2 * this.eshToSvgPx;
        for (const offset of [positiveOffset, -positiveOffset]) {
            const circle = svgNode("circle");
            circle.setAttribute("cx", cx + nx * offset);
            circle.setAttribute("cy", cy + ny * offset);
            symbol.append(circle);
        }
        edgesSvg.append(symbol);
        return symbol;
    }
    lunarCycleSymbol(startSlot, endSlot) {
        const edge = this.edges.get(hashEdge(startSlot, endSlot));
        const symbol = edge.symbol ?? (edge.symbol = newLunarCycleSymbol());
        let [p1, p2] = [edge.pos1, edge.pos2];
        if (startSlot != edge.slot1Id) {
            [p1, p2] = [p2, p1];
        }
        symbol.setAttribute("x1", p1[0]);
        symbol.setAttribute("y1", p1[1]);
        return [symbol, p1, p2];
    }
    async showAndDeletePatterns(patterns, subjectSlot, color) {
        try {
            await this.showPatterns(patterns, subjectSlot, color);
        }
        finally {
            // In case an ABORT happens...
            backend._PatternNode_DeleteChain(patterns);
        }
    }
    async showPatterns(patterns, subjectSlot, color) {
        const fullMoonBonus = (
            color == "white" && (this.perks & backendConst.PerkSuperMoon)
        ) ? 2 : 0;
        const lunarCycleBonus = (
            color == "white" && (this.perks & backendConst.PerkLightOfMars)
        ) ? 2 : 0;
        const alwaysOnePoint = (
            color == "black" && (this.perks & backendConst.PerkMoonAtApogee)
        );
        const canSteal = !(
            color == "black" && (this.perks & backendConst.PerkWinterSolstice)
        );
        const triplePoints = (
            color == "white" && (this.perks & backendConst.PerkSagittarius)
        );
        // Sagittarius is one-shot
        if (triplePoints && !backend._Glue_IsNull(patterns)) {
            this.perks &= ~backendConst.PerkSagittarius;
        }
        let node = patterns;
        while (!backend._Glue_IsNull(node)) {
            const pattern = backend.getValue(
                node + backendConst.PatternNodePattern, '*'
            );
            const kind = backend._Glue_PatternKind(pattern);
            let text;
            let starredSlots = [subjectSlot];
            let showStarsOneByOne = false;
            const occupiedSlots = [];
            const edgeAnimations = [];
            let bonus = 0;
            switch (kind) {
            case backendConst.PkPhasePair: {
                text = "Phase Pair";
                const otherId = backend.getValue(
                    pattern + backendConst.PatternOtherId, int
                );
                occupiedSlots.push(subjectSlot, otherId);
                edgeAnimations.push(new FadeIn(
                    this.phasePairSymbol(subjectSlot, otherId)
                ));
                break;
            }
            case backendConst.PkFullMoon: {
                text = "Full Moon Pair";
                const otherId = backend.getValue(
                    pattern + backendConst.PatternOtherId, int
                );
                if (!alwaysOnePoint) {
                    starredSlots = occupiedSlots;
                    bonus += fullMoonBonus;
                }
                occupiedSlots.push(subjectSlot, otherId);
                edgeAnimations.push(new FadeIn(
                    this.fullMoonSymbol(subjectSlot, otherId)
                ));
                break;
            }
            case backendConst.PkLunarCycle: {
                let node = backend.getValue(
                    pattern + backendConst.PatternList, '*'
                );
                let lastSlot = null;
                while (!backend._Glue_IsNull(node)) {
                    const thisSlot = backend.getValue(
                        node + backendConst.SlotNodeSlotId, int
                    );
                    occupiedSlots.push(thisSlot);
                    if (lastSlot != null) {
                        edgeAnimations.push(new DrawLine(
                            ...this.lunarCycleSymbol(lastSlot, thisSlot)
                        ));
                    }
                    lastSlot = thisSlot;
                    node = backend.getValue(
                        node + backendConst.SlotNodeNext, '*'
                    );
                }
                if (!alwaysOnePoint) {
                    starredSlots = occupiedSlots;
                    bonus += lunarCycleBonus;
                }
                text = `Lunar Cycle of ${occupiedSlots.length}`;
                showStarsOneByOne = true;
                break;
            }
            default:
                throw `invalid pattern kind ${kind}`;
            }
            if (triplePoints) {
                bonus += 2 * (bonus + starredSlots.length);
            }
            let owningSlots;
            if (canSteal) {
                owningSlots = occupiedSlots;
            }
            else {
                owningSlots = occupiedSlots.filter(
                    slotId => this.slots[slotId].cardColor == "gray"
                );
            }
            for (const slotId of owningSlots) {
                this.slots[slotId].setCardColor("gray");
            }
            // Set animations to initial states
            for (const animation of edgeAnimations) {
                animation.run(0);
            }
            await Promise.all([
                this.showDialogueBox(text),
                this.scaleCards(occupiedSlots, true),
            ]);
            await this.sleep(500);
            for (const slotId of owningSlots) {
                this.slots[slotId].setCardColor(color);
            }
            const [stars] = await Promise.all([
                this.showStars(starredSlots, color, showStarsOneByOne),
                this.hideDialogueBox(),
                (async () => {
                    for (const a of edgeAnimations) {
                        await this.runAnimation(150, a);
                    }
                })(),
            ]);
            await this.hideStars(stars, color);
            await this.scaleCards(occupiedSlots, false);
            if (bonus > 0) {
                await this.bonusStarsProcedure(bonus, color);
            }
            node = backend.getValue(
                node + backendConst.PatternNodeNext, '*'
            );
        }
    }
    async bonusStarsProcedure(bonus, color, message="Wildcard bonus") {
        const plural = bonus > 1 ? "s" : "";
        const [, stars] = await Promise.all([
            this.showDialogueBox(`${message}! +${bonus} point${plural}!`),
            this.showBonusStars(bonus, color),
        ]);
        await this.sleep(200);
        await this.hideStars(stars, color);
        await this.hideDialogueBox();
    }
    async endGameBonus() {
        const blackIds = [];
        const whiteIds = [];
        for (let i = 0; i < this.slots.length; ++i) {
            switch (this.slots[i].cardColor) {
            case "black":
                blackIds.push(i);
                break;
            case "white":
                whiteIds.push(i);
                break;
            }
        }
        await this.sleep(1000);
        await this.showDialogueBox("End Bonus Points");
        if ((this.perks & backendConst.PerkScorpio) == 0) {
            await this.scaleCards(blackIds, true);
            const stars1 = await this.showStars(blackIds, "black");
            await this.hideStars(stars1, "black");
            await this.scaleCards(blackIds, false);
        }
        await this.scaleCards(whiteIds, true);
        const stars2 = await this.showStars(whiteIds, "white");
        await this.hideStars(stars2, "white");
        await this.scaleCards(whiteIds, false);
        await this.hideDialogueBox();
        const whitePoint = whiteIds.length;
        if ((this.perks & backendConst.PerkLightOfVenus) && whitePoint > 0) {
            await this.bonusStarsProcedure(
                whitePoint, "white", "Light of Venus"
            );
        }
        if (this.aquarius) {
            await this.bonusStarsProcedure(10, "white", "Aquarius");
        }
    }
    async destroyCards(slotIds) {
        const edges = new Set();
        for (const slotId of slotIds) {
            for (const neighbor of this.adjList[slotId]) {
                edges.add(hashEdge(neighbor, slotId));
            }
        }
        const edgeSymbols = [];
        for (const edgeHash of edges) {
            const edge = this.edges.get(edgeHash);
            if (edge.symbol != null) {
                edgeSymbols.push(edge.symbol);
                edge.symbol = null;
            }
        }
        await this.runAnimation(1000,
            ...slotIds.map(slotId => new FadeOut(this.slots[slotId].card)),
            ...edgeSymbols.map(symbol => new FadeOut(symbol)),
        );
        this.slotsFilled -= slotIds.length;
        for (const slotId of slotIds) {
            const slot = this.slots[slotId];
            slot.card.remove();
            slot.card = null;
            slot.cardColor = null;
            slot.phase = null;
            backend._GameBoard_DestroyCard(this.board, slotId);
        }
        for (const symbol of edgeSymbols) {
            symbol.remove();
        }
    }
    abort() {
        this.abortController.abort();
        if (this.userPlaceCardEndCallbacks != undefined) {
            this.userPlaceCardEndCallbacks.reject(ABORTED);
        }
        this.cleanup();
    }
    cleanup() {
        backend._free(this.displayableBoard);
        backend._GameBoard_Delete(this.board);
    }
    cleanDom() {
        this.cleanedDom = true;
        clearChildren(edgesSvg);
        clearChildren(slotsDiv);
        clearChildren(lunarHandDiv);
        clearChildren(userHandDiv);
        clearChildren(gameBoardCardsDiv);
        clearChildren(starsDiv);
        slotsDiv.classList.remove("enabled");
        userHandDiv.classList.remove("enabled");
        cardSelectionBox.style.opacity = "0";
        dialogueBox.style.opacity = "0";
        wildcardsButton.setAttribute("disabled", "");
    }
}

function emphasizedText(text) {
    const element = document.createElement("span");
    element.textContent = text;
    element.classList.add("emphasized-text");
    element.classList.add("size-large");
    return element;
}

class TutorialGame extends Game {
    constructor() {
        super(-1, Boards.ThreeByThree, 1);
    }
    showDialogueBox(text) {  // override
        return Promise.resolve();
    }
    hideDialogueBox() {  // override
        return Promise.resolve();
    }
    updateDialogueText(...components) {
        return updateDialogueText(this.abortSignal, ...components);
    }
    async controller() {  // override
        await super.showDialogueBox(
            "You're playing against the Half Moon. You'll take turns placing"
            + " moon cards on the board competing to score the most points."
        );
        await this.sleep(4500);
        // Computer goes first in tutorial
        this.lunarForceOp = {phase: 1, slotId: 0};
        this.computerStartThinking();
        await Promise.all([
            this.updateDialogueText(
                "It's your turn. Place a card next to this one with the"
                + " matching moon phase to make a ",
                emphasizedText("PHASE PAIR"),
                ".",
            ),
            this.computerRound(),
        ]);
        this.userForceOp = {phase: 1, slotId: 1};
        this.lunarForceOp = {phase: 6, slotId: 3};
        await this.userRound(async () => {
            this.updateDialogueText(
                "Great Job! You created a ",
                emphasizedText("PHASE PAIR"),
                " worth one point.",
            );
        });
        await this.sleep(3000);
        await this.updateDialogueText(
            "But ",
            emphasizedText("PHASE PAIRS"),
            " aren't the only matches you can make...",
        );
        await this.sleep(4000);
        await Promise.all([
            this.updateDialogueText(
                "Now, place the opposite phase card to create a ",
                emphasizedText("FULL MOON PAIR"),
                ".",
            ),
            this.computerRound(),
        ]);
        this.userForceOp = {phase: 2, slotId: 4};
        this.lunarForceOp = {phase: 0, slotId: 6};
        await this.userRound(async () => {
            this.updateDialogueText(
                "Stellar! Opposite phase cards make a ",
                emphasizedText("FULL MOON PAIR"),
                " worth two points.",
            );
        });
        await this.sleep(3000);
        await this.updateDialogueText(
            "Besides pairs, you can also connect the phases to each"
            + " other for more points...",
        );
        await this.sleep(4000);
        await this.computerRound();
        this.lunarForceOp = {phase: 6, slotId: 8};
        this.computerStartThinking();
        await this.computerRound();
        await this.updateDialogueText(
            "Place the missing phase card to connect all three cards in a ",
            emphasizedText("LUNAR CYCLE"),
            ".",
        );
        this.userForceOp = {phase: 7, slotId: 7};
        this.lunarForceOp = {phase: 5, slotId: 5};
        await this.userRound(async () => {
            this.updateDialogueText(
                "Nice work! You created a ",
                emphasizedText("LUNAR CYCLE"),
                " of three cards worth three points.",
            );
        });
        await this.sleep(3000);
        await this.updateDialogueText(
            "But ",
            emphasizedText("LUNAR CYCLES"),
            " can be longer than three cards...",
        );
        await this.sleep(4000);
        await Promise.all([
            this.computerRound(),
            this.updateDialogueText(
                "Oh no, the Half Moon has stolen your ",
                emphasizedText("LUNAR CYCLE"),
                "! It's now four cards long and the Moon scores four points.",
            ),
        ]);
        await this.sleep(3000);
        this.userForceOp = {phase: 4, slotId: 2};
        await this.updateDialogueText(
            "Add a card to the ",
            emphasizedText("LUNAR CYCLE"),
            " to extend it again and claim them back!",
        );
        await this.userRound(async () => {
            this.updateDialogueText(
                "You did it! The cards are yours again and you get five"
                + " more points for a five card ",
                emphasizedText("LUNAR CYCLE"),
                ".",
            );
        });
        await this.sleep(3000);
        await this.updateDialogueText(
            "The game ends when the board is completely filled with cards.",
        );
        await this.sleep(3000);
        await Promise.all([
            this.updateDialogueText(
                "Both players receive a bonus point for each card they"
                + " have claimed on the final board.",
            ),
            this.endGameBonus(),
        ]);
        await this.sleep(3000);
        await super.hideDialogueBox();
        this.cleanup();
    }
    showWildcards() {  // override
        return false;
    }
    enableUserInput() {  // override
        this.userHandInputEnabled = true;
        this.emptySlotsInputEnabled = true;
        // Force user to play the card at a certain slot
        this.slots[this.userForceOp.slotId].button.classList.add("forced");
        userHandDiv.classList.add("enabled");
    }
    userRoundBegin() {  // override
        return this.dealUserCard(0, this.userForceOp.phase);
    }
    filterSlot(slotId) {  // override
        return slotId != this.userForceOp.slotId;
    }
    disableUserInput() {  // override
        this.userHandInputEnabled = false;
        this.emptySlotsInputEnabled = false;
        this.slots[this.userForceOp.slotId].button.classList.remove("forced");
        userHandDiv.classList.remove("enabled");
    }
    computerStartThinking() {  // override
        const force = this.lunarForceOp;
        this.prepareLunarCard(0, force.phase);
        this.aiDecision = [0, force.slotId];
    }
    async computerDecisionRequired() {  // override
        return this.aiDecision;
    }
}

// --- Wildcard util functions

async function askForSlot(game, slots) {
    let promiseHandlers;
    const clickHandlers = [];
    for (const slotId of slots) {
        const clickHandler = (event) => {
            promiseHandlers.resolve(slotId);
        };
        clickHandlers.push(clickHandler);
        const card = game.slots[slotId].card;
        card.addEventListener("click", clickHandler);
        card.classList.add("clickable");
    }
    function onAbort() {
        promiseHandlers.reject(ABORTED);
    }
    const slotId = await new Promise((resolve, reject) => {
        promiseHandlers = {resolve, reject};
        game.abortSignal.addEventListener("abort", onAbort);
    });
    game.abortSignal.removeEventListener("abort", onAbort);
    for (let i = 0; i < slots.length; ++i) {
        const card = game.slots[slots[i]].card;
        card.removeEventListener("click", clickHandlers[i]);
        card.classList.remove("clickable");
    }
    return slotId;
}

function getLunarSlots(game) {
    return rangeFilter(
        game.numSlots, i => game.slots[i].cardColor == "black"
    );
}
function getNonEmptySlots(game) {
    return rangeFilter(
        game.numSlots, i => game.slots[i].cardColor != null
    );
}

async function noCardToChooseFrom(game) {
    await game.showDialogueBox("There is no card to choose from!");
    await game.sleep(1000);
    await game.hideDialogueBox();
}

async function perkMessage(game, message) {
    await game.showDialogueBox(message);
    await game.sleep(1500);
    await game.hideDialogueBox();
}

function perkSetter(perkName, message) {
    return async (game) => {
        const perkFlag = backendConst[perkName];
        game.perks |= perkFlag;
        const perksPtr = game.board + backendConst.GameBoardPerks;
        backend.setValue(
            perksPtr, backend.getValue(perksPtr, int) | perkFlag, int
        );
        await perkMessage(game, message);
    };
}

const runScorpioPerk = perkSetter(
    "PerkScorpio",
    "The Half Moon won't get end game bonus points."
);
const scorpioDescription =
    "The Half Moon gets no bonus points at the end of the current level.";

// Indices here are phases
const beaverMoonTransform = [4, 7, 6, 5, 0, 3, 2, 1];

const DO_NOT_CONSUME = new Object();

const Wildcards = {
    HUNTER_MOON: {
        id: 0,
        name: "Hunter Moon",
        origin: "October",
        description:
            "Destroy all cards controlled by the Half Moon on the board.",
        uv: [0, 0],
        async run(game) {
            await game.destroyCards(getLunarSlots(game));
        },
    },
    SUPER_MOON: {
        id: 1,
        name: "Super Moon",
        origin: "October",
        description: "Make your Full Moon Pairs worth double for the current"
            + " level.",
        uv: [1, 0],
        run: perkSetter(
            "PerkSuperMoon",
            "Your Full Moon Pairs will be worth double."
        ),
    },
    SCORPIO: {
        id: 2,
        name: "Scorpio",
        origin: "October",
        description: scorpioDescription,
        uv: [2, 0],
        run: runScorpioPerk,
    },
    LEONIDS_METEOR_SHOWER: {
        id: 3,
        name: "Leonids Meteor Shower",
        origin: "October",
        description: "Destroy 2 random cards on the board.",
        uv: [3, 0],
        async run(game) {
            const slotIds = getNonEmptySlots(game);
            let destroys;
            if (slotIds.length > 2) {
                const aIdx = randomInt(slotIds.length);
                const a = slotIds[aIdx];
                slotIds.splice(aIdx, 1);
                const b = slotIds[randomInt(slotIds.length)];
                destroys = [a, b];
            }
            else {
                destroys = slotIds;
            }
            await game.destroyCards(destroys);
        },
    },
    WINTER_SOLSTICE: {
        id: 4,
        name: "Winter Solstice",
        origin: "November",
        description:
            "Your claimed cards can not be stolen for the current level.",
        uv: [0, 1],
        run: perkSetter(
            "PerkWinterSolstice",
            "The Half Moon won't be able to steal your cards for the current"
            + " level."
        ),
    },
    BEAVER_MOON: {
        id: 5,
        name: "Beaver Moon",
        origin: "November",
        description:
            "Flips a card on the board horizontally, or change New Moons into"
            + " Full Moons and vice versa. If that helps you form patterns,"
            + " you get points and claim the cards as normal.",
        uv: [1, 1],
        async run(game) {
            const selectable = getNonEmptySlots(game);
            if (selectable.length == 0) {
                await noCardToChooseFrom(game);
                return DO_NOT_CONSUME;
            }
            await game.showDialogueBox("Pick a card to flip.");
            const slotId = await askForSlot(game, selectable);
            await game.hideDialogueBox();
            const slot = game.slots[slotId];
            const phase = beaverMoonTransform[slot.phase];
            await game.destroyCards([slotId]);
            const cardElement = newCard();
            cardElement.classList.add("gray", moonPhases[phase]);
            cardElement.style.top = gh(slot.centerPosYGh - halfCardSize);
            const patterns = game.simplyPlaceUserCard(
                phase, slotId, cardElement
            );
            gameBoardCardsDiv.append(cardElement);
            await game.runAnimation(500,
                new TranslateX(
                    cardElement, game.outsideScreenX,
                    slot.centerPosXGh - halfCardSize
                ),
            );
            await game.showAndDeletePatterns(patterns, slotId, "white");
        },
    },
    SAGITTARIUS: {
        id: 6,
        name: "Sagittarius",
        origin: "November",
        description:
            "The next match you make will be worth triple points. If you"
            + " make multiple matches in one move, all matches get tripled.",
        uv: [2, 1],
        run: perkSetter(
            "PerkSagittarius",
            "Your next match(es) will receive triple points."
        ),
    },
    GEMINID_METEOR_SHOWER: {
        id: 7,
        name: "Geminid Meteor Shower",
        origin: "November",
        description:
            "Lets you claim half of the computer's claimed cards on the "
            + "board.",
        uv: [3, 1],
        async run(game) {
            const slots = randomChooseHalf(getLunarSlots(game));
            for (const slotId of slots) {
                game.slots[slotId].setCardColor("gray");
            }
            await game.scaleCards(slots, true);
            await game.sleep(500);
            for (const slotId of slots) {
                game.slots[slotId].setCardColor("white");
                backend._Glue_ChangeSlotOwner(
                    game.board, slotId, backendConst.PlayerWhite
                );
            }
            await game.sleep(500);
            await game.scaleCards(slots, false);
        },
    },
    LONG_NIGHT_MOON: {
        id: 8,
        name: "Long Night Moon",
        origin: "December",
        description: scorpioDescription,
        uv: [0, 2],
        run: runScorpioPerk,
    },
    QUADRANTIDS_METEOR_SHOWER: {
        id: 9,
        name: "Quadrantids Meteor Shower",
        origin: "December",
        description: "Randomly destroys half the cards on the board.",
        uv: [1, 2],
        async run(game) {
            await game.destroyCards(randomChooseHalf(getNonEmptySlots(game)));
        },
    },
    LIGHT_OF_MARS: {
        id: 10,
        name: "Light of Mars",
        origin: "December",
        description:
            "Makes your Lunar Cycles worth +2 points for the current level.",
        uv: [2, 2],
        run: perkSetter(
            "PerkLightOfMars",
            "Your Lunar Cycles will be worth +2 points."
        ),
    },
    CAPRICORN: {
        id: 11,
        name: "Capricorn",
        origin: "December",
        description:
            "Lets you place your card on top of another card on the board for"
            + " your current turn.",
        uv: [3, 2],
        async run(game) {
            const selectable = getNonEmptySlots(game);
            if (selectable.length == 0) {
                await noCardToChooseFrom(game);
                return DO_NOT_CONSUME;
            }
            await game.showDialogueBox(
                "You may place your card on top of another card."
            );
            game.userHandInputEnabled = true;
            userHandDiv.classList.add("enabled");
            const slotId = await askForSlot(game, selectable);
            game.userHandInputEnabled = false;
            userHandDiv.classList.remove("enabled");
            await game.hideDialogueBox();
            await game.destroyCards([slotId]);
            setTimeout(() => {
                game.onUserPlaceCard(slotId);
            }, 0);
        },
    },
    AQUARIUS: {
        id: 12,
        name: "Aquarius",
        origin: "January",
        description: "Get 10 extra points at the end of current level.",
        uv: [0, 3],
        async run(game) {
            game.aquarius = true;
            await perkMessage(
                game,
                "You will get 10 extra points at the end of this level."
            );
        },
    },
    LIGHT_OF_VENUS: {
        id: 13,
        name: "Light of Venus",
        origin: "January",
        description:
            "Get 1 extra point for each card you've claimed at the end of"
            + " current level.",
        uv: [1, 3],
        run: perkSetter(
            "PerkLightOfVenus",
            "Your end game bonus points will be doubled."
        ),
    },
    MOON_AT_APOGEE: {
        id: 14,
        name: "Moon at Apogee",
        origin: "January",
        description:
            "Makes all of the computer's matches worth 1 point for the current"
            + " level.",
        uv: [2, 3],
        run: perkSetter(
            "PerkMoonAtApogee",
            "The Half Moon's matches will all be worth 1 point."
        ),
    },
    WOLF_MOON: {
        id: 15,
        name: "Wolf Moon",
        origin: "January",
        description:
            "Choose 1 of the cards claimed by the Half Moon to destroy that"
            + " card and all cards claimed by the Half Moon that are directly"
            + " connected to it.",
        uv: [3, 3],
        async run(game) {
            const selectable = getLunarSlots(game);
            if (selectable.length == 0) {
                await noCardToChooseFrom(game);
                return DO_NOT_CONSUME;
            }
            await game.showDialogueBox(
                "Choose a card claimed by the Half Moon"
            );
            const slotId = await askForSlot(game, selectable);
            const destroying = [slotId];
            for (const neighbor of game.adjList[slotId]) {
                if (game.slots[neighbor].cardColor == "black") {
                    destroying.push(neighbor);
                }
            }
            await game.hideDialogueBox();
            await game.destroyCards(destroying);
        },
    },
};
const wildcardNames = Object.getOwnPropertyNames(Wildcards);
const wildcardIds = wildcardNames.map(name => Wildcards[name].id);
const wildcardIdToName = new Map(wildcardNames.map(
    (name) => [Wildcards[name].id, name]
));

// "lunar-wildcards" local storage is a JSON array of wildcard IDs.

const wildcardMenu = document.getElementById("wildcard-menu");
const wildcardIconDiv = document.getElementById("wildcard-icon");
const wildcardNameP = document.getElementById("wildcard-name");
const wildcardOriginP = document.getElementById("wildcard-origin");
const wildcardDescriptionP = document.getElementById("wildcard-description");
const wildcardPlayButton = document.getElementById("wildcard-play-button");
const wildcardInfoBox = document.getElementById("wildcard-info-box");
const wildcardNoInfoHint = document.getElementById("wildcard-no-info-hint");

function setWildcardIconUV(element, uv) {
    element.style.backgroundPositionX =
        `calc(-${uv[0]} * var(--wildcard-sprite-size))`;
    element.style.backgroundPositionY =
        `calc(-${uv[1]} * var(--wildcard-sprite-size))`;
}

const playedWildcards = new Set();

function addWildcardToDom(id) {
    const wc = Wildcards[wildcardIdToName.get(id)];
    const button = document.createElement("button");
    button.classList.add("wildcard-sprite");
    button.type = "button";
    button.title = wc.name;
    setWildcardIconUV(button, wc.uv);
    button.addEventListener("click", (event) => {
        wildcardInfoBox.classList.remove("display-none");
        wildcardNoInfoHint.classList.add("display-none");
        setWildcardIconUV(wildcardIconDiv, wc.uv);
        wildcardNameP.textContent = wc.name;
        wildcardOriginP.textContent = `From ${wc.origin}`;
        wildcardDescriptionP.textContent = wc.description;
        const playedCard = playedWildcards.has(id);
        wildcardPlayButton.classList.toggle("display-none", playedCard);
        if (!playedCard) {
            wildcardPlayButton.onclick = async (event) => {
                const gm = gameState.gameObj.game;
                gm.disableUserInput();
                wildcardsButton.setAttribute("disabled", "");
                await hidePopup();
                try {
                    const outcome = await wc.run(gm);
                    if (outcome !== DO_NOT_CONSUME) {
                        playedWildcards.add(id);
                    }
                }
                catch (exc) {
                    if (exc === ABORTED) {
                        return;
                    }
                    throw exc;
                }
                wildcardsButton.removeAttribute("disabled");
                gm.enableUserInput();
            };
        }
    });
    wildcardMenu.append(button);
}

class WildcardManager {
    constructor() {
        const wildcardsStr = localStorage.getItem("lunar-wildcards");
        this.wildcards = new Set(wildcardsStr ? JSON.parse(wildcardsStr) : []);
        this.nextCardProgress = 0;
        this.wildcards.forEach(addWildcardToDom);
    }
    allCardsObtained() {
        return this.wildcards.size == wildcardNames.length;
    }
    obtainOneCard() {
        const pool = wildcardIds.filter(id => !this.wildcards.has(id));
        const id = pool[randomInt(pool.length)];
        this.wildcards.add(id);
        localStorage.setItem(
            "lunar-wildcards", JSON.stringify(Array.from(this.wildcards))
        );
        addWildcardToDom(id);
        return id;
    }
    levelsNeeded() {
        // 2 levels needed for first 4 wildcards and 3 levels for
        // subsequent ones.
        return this.wildcards.size >= 4 ? 3 : 2;
    }
    getProgressPercentage() {
        return Math.round(100 * this.nextCardProgress / this.levelsNeeded());
    }
}

const wildcardManager = new WildcardManager();

const progressTopMessage = document.getElementById("progress-top-message");
const progressLevelText = document.getElementById("progress-level-text");
const progressStatsTable = document.getElementById("progress-stats");
const progressExitText = document.getElementById("progress-exit-text");
const progressContinueButton =
    document.getElementById("progress-continue-button");
const progressLeaveButton = document.getElementById("leave-button");
const progressLevelStars = document.getElementById("progress-level-stars");
const progressTotalStars = document.getElementById("progress-total-stars");
const progressButtons = document.getElementById("progress-buttons");
const progressHint = document.getElementById("progress-hint");
const progressWildcardDiv = document.getElementById("progress-wildcard");
const progressWildcardIcon = document.getElementById("progress-wildcard-icon");
const progressWildcardPercentage =
    document.getElementById("progress-wildcard-percentage");
const unlockedWildcardIcon = document.getElementById("unlocked-wildcard-icon");

const difficultyThreshold = [3, 6, 9];
const cardsInAHand = 3;

function setWildcardIconPercentage(percentage) {
    progressWildcardIcon.setAttribute("y", String(100 - percentage));
    progressWildcardIcon.setAttribute("height", String(percentage));
}

class WildcardIconGrow extends FromTo {
    constructor(from, to, easingFunc=linear) {
        super(from, to, easingFunc);
        this._run = setWildcardIconPercentage;
    }
}

function updateProgressButtons(lost) {
    progressLeaveButton.classList.toggle("expanded", lost);
    progressExitText.classList.toggle("display-none", !lost);
    progressContinueButton.classList.toggle("display-none", lost);
}

class LeveledGame {
    constructor(tutorial) {
        this.tutorial = tutorial;
        this.totalScore = 0;
    }
    inGameAbort() {
        this.game.abort();
    }
    async controller() {
        let level = this.tutorial ? 0 : 1;
        let goOn = true;
        let reservedGameBoard = null;
        wildcardManager.nextCardProgress = 0;
        while (goOn) {
            await fadeOutCurrentScene();
            // Background middle if needed
            // Enter game-scene in order for Game to properly initialize
            // e.g. coordinate information; but we don't want user to
            // see the game-scene yet.
            gameSceneDiv.style.visibility = "hidden";
            enterScene("game-scene");
            // Wait a little in case the engine needs time to update
            // things...
            await sleep(1);
            const isTutorial = level == 0;
            let gameBoard;
            if (isTutorial) {
                this.game = new TutorialGame();
            }
            else {
                const aiDepth =
                    level <= difficultyThreshold[0] ? AILevel.WEAK :
                    level <= difficultyThreshold[1] ? AILevel.GREEDY :
                    level <= difficultyThreshold[2] ? AILevel.SMART :
                    AILevel.SMARTER;
                if (reservedGameBoard != null) {
                    gameBoard = reservedGameBoard;
                    reservedGameBoard = null;
                }
                else {
                    gameBoard = randomBoard();
                }
                this.game = new Game(aiDepth, gameBoard, cardsInAHand);
            }
            enterScene(null);
            gameSceneDiv.style.removeProperty("visibility");
            enterSceneAnimated("game-scene");
            try {
                await this.game.controller();
            }
            catch (exc) {
                if (exc === ABORTED) {
                    break;
                }
                else {
                    this.game.cleanDom();
                    throw exc;
                }
            }
            const us = this.game.userScore;
            const ls = this.game.lunarScore;
            if (activePopup != null) {
                // Mo more in-game popups after the game finishes
                await hidePopup();
            }
            await fadeOutCurrentScene();
            this.game.cleanDom();
            const allWcsObtained = wildcardManager.allCardsObtained();
            progressLevelText.textContent = isTutorial ? "Tutorial completed!"
                : "Level " + level;
            progressStatsTable.classList.toggle("display-none", isTutorial);
            progressWildcardDiv.classList.toggle(
                "display-none", isTutorial || allWcsObtained
            );
            updateProgressButtons(us < ls);
            unlockedWildcardIcon.classList.add("display-none");
            if (us > ls) {
                // Background left
                progressTopMessage.textContent = "You win!";
                progressContinueButton.textContent = "Continue";
            }
            else if (us == ls) {
                // Background right
                progressTopMessage.textContent =
                    "Retry this level to advance.";
                progressContinueButton.textContent = "Retry";
                reservedGameBoard = gameBoard;
            }
            else {
                // Background right
                progressTopMessage.textContent =
                    "The Half Moon has ended your journey.";
            }
            const oldScore = this.totalScore;
            progressTotalStars.textContent = String(oldScore);
            progressLevelStars.textContent = "0";
            progressButtons.style.opacity = "0";
            progressButtons.style.pointerEvents = "none";
            const aiEvolved = difficultyThreshold.includes(level) && us > ls;
            if (aiEvolved) {
                progressHint.textContent =
                    "Watch out! The game has become harder...";
            }
            progressHint.classList.toggle("display-none", !aiEvolved);
            const oldWcPercentage = wildcardManager.getProgressPercentage();
            setWildcardIconPercentage(oldWcPercentage);
            progressWildcardPercentage.textContent = String(oldWcPercentage);
            await enterSceneAnimated("progress-scene");
            if (!isTutorial) {
                this.totalScore += us;
                tryUpdateRecord({level: level, stars: this.totalScore});
                await runAnimation(
                    1500, null,
                    new Count(progressTotalStars, oldScore, this.totalScore),
                    new Count(progressLevelStars, 0, us),
                );
                // Wildcard progress...
                if (!allWcsObtained) {
                    let unlockedCard = false;
                    if (us > ls) {
                        ++wildcardManager.nextCardProgress;
                        unlockedCard = wildcardManager.nextCardProgress
                            == wildcardManager.levelsNeeded();
                    }
                    else if (us < ls) {
                        wildcardManager.nextCardProgress = 0;
                    }
                    if (us != ls) {
                        const newWcPercentage =
                            wildcardManager.getProgressPercentage();
                        await runAnimation(1000, null,
                            new WildcardIconGrow(
                                oldWcPercentage, newWcPercentage),
                            new Count(progressWildcardPercentage,
                                oldWcPercentage, newWcPercentage),
                        );
                    }
                    if (unlockedCard) {
                        const id = wildcardManager.obtainOneCard();
                        const wc = Wildcards[wildcardIdToName.get(id)];
                        setWildcardIconUV(unlockedWildcardIcon, wc.uv);
                        unlockedWildcardIcon.classList.remove("display-none");
                        wildcardManager.nextCardProgress = 0;
                        await runAnimation(
                            500, null, new Scale(unlockedWildcardIcon, 1, 0)
                        );
                    }
                }
            }
            await runAnimation(300, null, new FadeIn(progressButtons));
            // If the user loses they only have the option to leave;
            // tutorial progress doesn't really matter:
            noLeaveConfirm = us < ls || isTutorial;
            progressButtons.style.removeProperty("pointer-events");
            goOn = await new Promise(
                (resolve) => {this.progress = resolve;}
            );
            if (us > ls) {
                ++level;
            }
        }
        playedWildcards.clear();
        await fadeOutCurrentScene();
        if (!this.game.cleanedDom) {
            this.game.cleanDom();
        }
        // Background middle if needed
        updateRecordText();
        gameState.state = GameState.MENU;
        gameState.gameObj = null;
        await enterSceneAnimated("menu-scene");
        this.game = undefined;  // For GC
    }
}

class CustomGame {
    constructor(aiLevel, gameBoard, userFirst) {
        this.aiLevel = aiLevel;
        this.gameBoard = gameBoard;
        this.userFirst = userFirst;
    }
    inGameAbort() {
        this.game.abort();
    }
    async controller() {
        await fadeOutCurrentScene();
        // See `LeveledGame` for why we do these:
        gameSceneDiv.style.visibility = "hidden";
        enterScene("game-scene");
        await sleep(1);
        this.game = new Game(this.aiLevel, this.gameBoard, cardsInAHand);
        this.game.userGoesFirst = this.userFirst;
        enterScene(null);
        gameSceneDiv.style.removeProperty("visibility");
        enterSceneAnimated("game-scene");
        let aborted = false;
        try {
            await this.game.controller();
        }
        catch (exc) {
            if (exc === ABORTED) {
                aborted = true;
            }
            else {
                this.game.cleanDom();
                throw exc;
            }
        }
        const us = this.game.userScore;
        const ls = this.game.lunarScore;
        if (activePopup != null) {
            // Mo more in-game popups after the game finishes
            await hidePopup();
        }
        await fadeOutCurrentScene();
        this.game.cleanDom();
        if (aborted) {
            this.cleanup();
        }
        else {
            // Show progress scene
            progressTopMessage.textContent = (
                us > ls ? "You win!" :
                us < ls ? "The Half Moon wins." :
                "Draw!"
            );
            progressWildcardDiv.classList.add("display-none");
            progressLevelText.textContent = "Custom Level";
            progressHint.classList.remove("display-none");
            progressHint.textContent = `You ${us} : ${ls} Half Moon`;
            progressStatsTable.classList.add("display-none");
            updateProgressButtons(true);
            noLeaveConfirm = true;
            await enterSceneAnimated("progress-scene");
        }
    }
    async cleanup() {
        // Call after fading out current scene
        playedWildcards.clear();
        gameState.state = GameState.MENU;
        gameState.gameObj = null;
        await enterSceneAnimated("menu-scene");
    }
}

const GameState = {
    MENU: 0,
    REGULAR: 1,
    CUSTOM: 2,
};

class RunningGameState {
    constructor() {
        this.state = GameState.MENU;
        this.gameObj = null;
    }
}

const gameState = new RunningGameState();

function newLeveledGame(tutorial) {
    const leveledGame = new LeveledGame(tutorial);
    gameState.state = GameState.REGULAR;
    gameState.gameObj = leveledGame;
    leveledGame.controller();
}

export function onTutorial() {
    newLeveledGame(true);
}

export function onPlay() {
    newLeveledGame(false);
}

export async function onCustomGame() {
    await fadeOutCurrentScene();
    await enterSceneAnimated("custom-settings-scene");
}

const popupLayer = document.getElementById("popup-layer");

let activePopup = null;

async function summonPopup(name) {
    const popup = document.getElementById(name);
    activePopup = name;
    popup.classList.add("visible");
    popupLayer.classList.add("visible");
    await runAnimation(300, null, new FadeIn(popupLayer));
}

export async function hidePopup() {
    popupLayer.classList.add("fading");
    const fadingPopup = activePopup;
    activePopup = null;
    await runAnimation(300, null, new FadeOut(popupLayer));
    document.getElementById(fadingPopup).classList.remove("visible");
    popupLayer.classList.remove("fading", "visible");
}

export let onQuit;

export async function onExitGame() {
    onQuit = async () => {
        await hidePopup();
        gameState.gameObj.inGameAbort();
    };
    await summonPopup("exit-confirm-popup");
}

let noLeaveConfirm = false;

async function progressSceneLeaveHandler() {
    if (gameState.state == GameState.REGULAR) {
        gameState.gameObj.progress(false);
    }
    else if (gameState.state == GameState.CUSTOM) {
        await fadeOutCurrentScene();
        await gameState.gameObj.cleanup();
    }
    else {
        throw new Error("Unexpected click on leave button.");
    }
}

export async function onLeave() {
    if (noLeaveConfirm) {
        await progressSceneLeaveHandler();
    }
    else {
        await summonPopup("exit-confirm-popup");
        onQuit = async () => {
            await hidePopup();
            await progressSceneLeaveHandler();
        };
    }
}

export function onContinue() {
    if (gameState.state != GameState.REGULAR) {
        throw new Error("Unexpected continue button click");
    }
    gameState.gameObj.progress(true);
}

export function onWildcardMenu() {
    summonPopup("wildcard-popup");
    wildcardInfoBox.classList.add("display-none");
    wildcardNoInfoHint.classList.remove("display-none");
}

export async function onCancelCustomGame() {
    await fadeOutCurrentScene();
    await enterSceneAnimated("menu-scene");
}

export function onRunCustomGame() {
    const aiLevel = parseInt(aiLevelSelect.value);
    const gameBoard = parseInt(gameBoardSelect.value);
    const userFirst = whoStartsSelect.value == "player";
    gameState.state = GameState.CUSTOM;
    const game = new CustomGame(aiLevel, gameBoard, userFirst);
    gameState.gameObj = game;
    game.controller();
}
