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

externalSvg("card.svg")
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
        return externalSvg("star.svg");
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
        const record = localStorage.getItem("lunar-record");
        updateRecordText(record ? JSON.parse(record) : null);
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

const slotButtonSize = 5.25;  // gh
const cardSize = slotButtonSize * 1.48;
const cardGap = cardSize * 0.2;
const lunarCard2CardScale = 1.35;
const lunarCardSize = cardSize / lunarCard2CardScale;
const bonusStarInitialPad = 3;  // gh
const bonusStarGap = 1.5  // gh
const largeCardScale = 1.2

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

function randomPhase() {
    return Math.floor(Math.random() * moonPhases.length);
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

class Game {
    constructor(aiDepth, boardType, cardsInAHand) {
        this.aiDepth = aiDepth;
        this.cardsInAHand = cardsInAHand;
        const db = backend._malloc(backendConst.DisplayableBoardSize);
        this.displayableBoard = db;
        backend._Glue_InitDisplayableBoard(db, boardType);
        this.board = backend.getValue(
            db + backendConst.DisplayableBoardBoard, '*'
        );
        this.userCardSelection = null;
        this.acceptUserInput = false;
        this.abortController = new AbortController();
        this.abortSignal = this.abortController.signal;
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
        const numSlots = backend.getValue(
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
        for (let i = 0; i < numSlots; ++i) {
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
        for (let i = 0; i < numSlots; ++i) {
            const p1 = slotPos[i];
            // Vertex
            const centerPosX = edgesOffsetX + scaleX * p1[0];
            const centerPosY = edgesOffsetY + scaleY * p1[1];
            const button = document.createElement("button");
            this.slots.push(new BoardSlot(centerPosX, centerPosY, button));
            button.type = "button";
            button.addEventListener("click", (event) => {
                if (!this.acceptUserInput) {
                    return;
                }
                this.onUserPlaceCard(i)
                    .then(this.userPlaceCardEndCallbacks.resolve)
                    .catch(this.userPlaceCardEndCallbacks.reject);
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
            let node = backend.getValue(adjPtr, '*');
            while (!backend._Glue_IsNull(node)) {
                const slotId = backend.getValue(
                    node + backendConst.SlotNodeSlotId, int
                );
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
        // User goes first
        let userRound = true;
        while (this.slotsFilled != this.slots.length) {
            await (userRound ? this.userRound() : this.computerRound());
            userRound = !userRound;
        }
        await this.endGameBonus();
        this.uninstall();
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
            if (!this.acceptUserInput) {
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
    async enableUserInput() {  // override-able
        await this.dealUserCard(this.userPlayedCard);
        // Allow user to pick a card and place it
        slotsDiv.classList.add("enabled");
        userHandDiv.classList.add("enabled");
    }
    async userRound(onRecvUserMove=null) {
        await this.enableUserInput();
        // Select the middle card by default
        this.updateUserCardSelection(Math.floor(this.cardsInAHand / 2));
        // Wait for user input
        this.acceptUserInput = true;
        await new Promise((resolve, reject) => {
            this.userPlaceCardEndCallbacks = {resolve, reject};
            this.onRecvUserMove = onRecvUserMove;
        });
    }
    disableUserInput(slotId) {  // override-able
        slotsDiv.classList.remove("enabled");
        userHandDiv.classList.remove("enabled");
    }
    computerStartThinking() {  // override-able
        this.prepareLunarCard(this.lunarPlayedCard);
        const aiChoices =
            backend._malloc(this.cardsInAHand * backendConst.IntSize);
        for (let i = 0, ptr = aiChoices; i < this.cardsInAHand; ++i) {
            backend.setValue(ptr, this.lunarHand[i].phase, int);
            ptr += backendConst.IntSize;
        }
        this.aiPromise = AIMove(
            this.board, aiChoices, this.cardsInAHand, this.aiDepth
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
    filterSlot(slotId) {  // override-able
        return false;
    }
    async onUserPlaceCard(slotId) {
        if (this.filterSlot(slotId)) {
            return;
        }
        this.acceptUserInput = false;
        if (this.onRecvUserMove != null) {
            await this.onRecvUserMove();
        }
        ++this.slotsFilled;
        const card = this.userHand[this.userCardSelection];
        this.userHand[this.userCardSelection] = null;
        this.userPlayedCard = this.userCardSelection;
        this.updateUserCardSelection(null);
        this.disableUserInput(slotId);
        card.element.removeEventListener("click", card.onclick);
        const patterns = backend._Glue_PutCard(
            this.board, slotId, card.phase, backendConst.PlayerWhite
        );
        if (this.slotsFilled != this.slots.length) {
            // As soon as the user plays their card, we could deal AI
            // the card (internally) and let it start thinking
            this.computerStartThinking();
        }
        const slot = this.slots[slotId];
        slot.card = card.element;
        slot.cardColor = "gray";
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
    async computerDecisionRequired() {  // override-able
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
    scaleCards(slotIds, from, to) {
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
            dStar.star.style.display = "none";
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
        let node = patterns;
        while (!backend._Glue_IsNull(node)) {
            const pattern = backend.getValue(
                node + backendConst.PatternNodePattern, '*'
            );
            const kind = backend._Glue_PatternKind(pattern);
            let text;
            let starredSlots;
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
                starredSlots = [subjectSlot];
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
                starredSlots = occupiedSlots;
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
                starredSlots = occupiedSlots;
                text = `Lunar Cycle of ${occupiedSlots.length}`;
                showStarsOneByOne = true;
                break;
            }
            default:
                throw `invalid pattern kind ${kind}`;
            }
            for (const slotId of occupiedSlots) {
                this.slots[slotId].setCardColor("gray");
            }
            // Set animations to initial states
            for (const animation of edgeAnimations) {
                animation.run(0);
            }
            await Promise.all([
                this.showDialogueBox(text),
                this.scaleCards(occupiedSlots, 1, largeCardScale),
            ]);
            await this.sleep(500);
            for (const slotId of occupiedSlots) {
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
            await this.scaleCards(occupiedSlots, largeCardScale, 1);
            if (bonus > 0) {
                const [, stars] = await Promise.all([
                    this.showDialogueBox("Wildcard bonus!"),
                    this.showBonusStars(bonus, color),
                ]);
                await this.sleep(500);
                await Promise.all([
                    this.hideDialogueBox(),
                    this.hideStars(stars, color),
                ]);
            }
            node = backend.getValue(
                node + backendConst.PatternNodeNext, '*'
            );
        }
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
        await this.scaleCards(blackIds, 1, largeCardScale);
        const stars1 = await this.showStars(blackIds, "black");
        await this.hideStars(stars1, "black");
        await this.scaleCards(blackIds, largeCardScale, 1);
        await this.scaleCards(whiteIds, 1, largeCardScale);
        const stars2 = await this.showStars(whiteIds, "white");
        await this.hideStars(stars2, "white");
        await this.scaleCards(whiteIds, largeCardScale, 1);
        await this.hideDialogueBox();
    }
    uninstall() {
        this.abortController.abort();
        backend._free(this.displayableBoard);
        backend._GameBoard_Delete(this.board);
        clearChildren(edgesSvg);
        clearChildren(slotsDiv);
        clearChildren(lunarHandDiv);
        clearChildren(userHandDiv);
        clearChildren(gameBoardCardsDiv);
        slotsDiv.classList.remove("enabled");
        userHandDiv.classList.remove("enabled");
        cardSelectionBox.style.opacity = "0";
        dialogueBox.style.opacity = "0";
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
        await this.sleep(6000);
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
        this.uninstall();
    }
    async enableUserInput() {  // override
        await this.dealUserCard(0, this.userForceOp.phase);
        // Force user to play the card at a certain slot
        this.slots[this.userForceOp.slotId].button.classList.add("forced");
        userHandDiv.classList.add("enabled");
    }
    filterSlot(slotId) {  // override
        return slotId != this.userForceOp.slotId;
    }
    disableUserInput(slotId) {  // override
        this.slots[slotId].button.classList.remove("forced");
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

let game;

function gameEnd() {
    game = undefined;  // For GC
    enterScene("menu-scene");
}

function runGame() {
    game.controller().then(gameEnd)
    .catch((reason) => {
        if (reason !== ABORTED) {
            throw reason;
        }
    });
}

export function onTutorial() {
    enterScene("game-scene");
    game = new TutorialGame();
    runGame();
}
export function onPlay() {
    enterScene("game-scene");
    game = new Game(4, Boards.Tree, 3);
    runGame();
}
export function onCustomGame() {}
export function onExitGame() {
    game.uninstall();
    gameEnd();
}
