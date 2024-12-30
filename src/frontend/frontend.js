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

function hashPos(arr) {
    return `${arr[0]},${arr[1]}`;
}

function svgNode(tag) {
    return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

class RenderedEdge {
    constructor(element, pos1, pos2) {
        this.element = element;
        this.pos1 = pos1;
        this.pos2 = pos2;
    }
}

const cardsInAHand = 3;

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
    width: ${gh(cardsInAHand * (cardSize + cardGap) - cardGap)};
}
div#lunar-cards-placeholder {
    height: ${gh(lunarCardSize)};
    width: ${gh(cardsInAHand * (lunarCardSize + cardGap) - cardGap)};
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showDialogueBox(text) {
    dialogueContent.textContent = text;
    return runAnimation(200, new FadeIn(dialogueBox));
}

async function updateDialogueText(text) {
    await runAnimation(100, new FadeOut(dialogueContent));
    dialogueContent.textContent = text;
    await runAnimation(100, new FadeIn(dialogueContent));
}

async function hideDialogueBox() {
    await runAnimation(200, new FadeOut(dialogueBox));
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

function runAnimation(durationMs, ...animations) {
    function invokeAnimations(progress) {
        for (const animation of animations) {
            animation.run(animation.easingFunc(progress));
        }
    }
    // Invoke with 0% progress immediately once. The user must not see
    // the state of the object between when `runAnimation` is called and
    // when `requestAnimationFrame` calls us back.
    invokeAnimations(0.0);
    return new Promise((resolve) => {
        let start;
        function draw(timestamp) {
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
    constructor(centerPosXGh, centerPosYGh) {
        this.centerPosXGh = centerPosXGh;
        this.centerPosYGh = centerPosYGh;
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

class Game {
    constructor(aiDepth, boardType) {
        this.aiDepth = aiDepth;
        const db = backend._malloc(backendConst.DisplayableBoardSize);
        this.displayableBoard = db;
        backend._Glue_InitDisplayableBoard(db, boardType);
        this.board = backend.getValue(
            db + backendConst.DisplayableBoardBoard, '*'
        );
        this.acceptUserInput = false;
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
        )
        const xLen = backend.getValue(
            db + backendConst.DisplayableBoardXLen, int
        );
        const yLen = backend.getValue(
            db + backendConst.DisplayableBoardYLen, int
        );
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
        edgesSvg.setAttribute("viewBox", `0 0 ${xLen} ${yLen}`);
        let adjPtr = backend.getValue(
            this.board + backendConst.GameBoardAdj, '*'
        );
        this.edges = new Map();  // `${x},${y}` -> <line> element
        this.slots = [];
        const svgRect = edgesSvg.getBoundingClientRect();
        const svgOffsetX = (svgRect.x - floatingLayerRect.x) * px2gh;
        const svgOffsetY = (svgRect.y - floatingLayerRect.y) * px2gh;
        const scaleX = svgRect.width / xLen * px2gh;
        const scaleY = svgRect.height / yLen * px2gh;
        for (let i = 0; i < numSlots; ++i) {
            const p1 = slotPos[i];
            // Vertex
            const centerPosX = svgOffsetX + scaleX * p1[0];
            const centerPosY = svgOffsetY + scaleY * p1[1];
            this.slots.push(new BoardSlot(centerPosX, centerPosY));
            const button = document.createElement("button");
            button.type = "button";
            button.addEventListener("click", (event) => {
                if (!this.acceptUserInput) {
                    return;
                }
                this.onUserPlaceCard(i);
            });
            button.style.left = gh(centerPosX - halfSlotButtonSize);
            button.style.top = gh(centerPosY - halfSlotButtonSize);
            const buttonIndicator = svgNode("svg");
            const indicatorRect = svgNode("rect");
            indicatorRect.setAttribute("fill", "none");
            indicatorRect.setAttribute("stroke", "white");
            indicatorRect.setAttribute("stroke-width", "3");
            indicatorRect.setAttribute("stroke-dasharray", "8 4");
            indicatorRect.setAttribute("height", "100%");
            indicatorRect.setAttribute("width", "100%");
            buttonIndicator.append(indicatorRect);
            button.append(buttonIndicator);
            slotsDiv.append(button);
            // Edges
            let node = backend.getValue(adjPtr, '*');
            while (!backend._Glue_IsNull(node)) {
                const slotId = backend.getValue(
                    node + backendConst.SlotNodeSlotId, int
                );
                const hash = hashPos([slotId, i].sort());
                if (!this.edges.has(hash)) {
                    const p2 = slotPos[slotId];
                    const line = svgNode("line");
                    line.setAttribute("x1", String(p1[0]));
                    line.setAttribute("y1", String(p1[1]));
                    line.setAttribute("x2", String(p2[0]));
                    line.setAttribute("y2", String(p2[1]));
                    this.edges.set(hash, new RenderedEdge(line, p1, p2));
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
        const promises = [];
        for (let i = 0; i < cardsInAHand - 1; ++i) {
            this.prepareLunarCard(i);
            promises.push(this.dealUserCard(i), this.dealLunarCard(i));
        }
        // User goes first
        Promise.all(promises).then(this.userRound.bind(this));
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
    async dealUserCard(cardIndex) {
        const phase = randomPhase();
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
        await runAnimation(400, new TranslateX(
            card, this.outsideScreenX, this.userCardX(cardIndex)
        ));
        // Flip card animation
        await runAnimation(150, new FlipCard1(card));
        card.classList.remove("back");
        card.classList.add("gray", moonPhases[phase]);
        await runAnimation(150, new FlipCard2(card));
    }
    prepareLunarCard(cardIndex) {
        const phase = randomPhase();
        const card = newCard();
        this.lunarHand[cardIndex] = new CardInHand(card, phase);
        card.classList.add("back");
        card.style.top = gh(this.lunarCardsY);
    }
    dealLunarCard(cardIndex) {
        const card = this.lunarHand[cardIndex].element;
        lunarHandDiv.append(card);
        // Fly-in animation
        return runAnimation(400, new TranslateX(
            card, this.outsideScreenX,
            this.lunarCardX(cardIndex)
        ));
    }
    async userRound() {
        await this.dealUserCard(this.userPlayedCard);
        // Allow user to pick a card and place it
        slotsDiv.classList.add("enabled");
        userHandDiv.classList.add("enabled");
        this.acceptUserInput = true;
        // Select the middle card by default
        this.userCardSelection = null;
        this.updateUserCardSelection(Math.floor(cardsInAHand / 2));
    }
    async onUserPlaceCard(slotId) {
        ++this.slotsFilled;
        const card = this.userHand[this.userCardSelection];
        this.userHand[this.userCardSelection] = null;
        this.userPlayedCard = this.userCardSelection;
        this.updateUserCardSelection(null);
        slotsDiv.classList.remove("enabled");
        userHandDiv.classList.remove("enabled");
        this.acceptUserInput = false;
        card.element.removeEventListener("click", card.onclick);
        const patterns = backend._Glue_PutCard(
            this.board, slotId, card.phase, backendConst.PlayerWhite
        );
        // As soon as the user plays their card, we could deal AI the
        // card (internally) and let it start thinking
        this.prepareLunarCard(this.lunarPlayedCard);
        const aiChoices = backend._malloc(cardsInAHand * backendConst.IntSize);
        for (let i = 0, ptr = aiChoices; i < cardsInAHand; ++i) {
            backend.setValue(ptr, this.lunarHand[i].phase, int);
            ptr += backendConst.IntSize;
        }
        this.aiPromise = AIMove(
            this.board, aiChoices, cardsInAHand, this.aiDepth
        );
        this.resolvedAIDecision = null;
        this.aiPromise.then((result) => {
            backend._free(aiChoices);
            this.resolvedAIDecision = result;
        });
        // Temporarily disable Exit button... It can lead to many
        // unexpected things when a C function is running.
        exitButton.setAttribute("disabled", "");
        const slot = this.slots[slotId];
        slot.card = card.element;
        slot.cardColor = "gray";
        await runAnimation(500,
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
        if (this.slotsFilled == this.slots.length) {
            this.endGameBonus();
        }
        else {
            this.computerRound();
        }
    }
    async computerRound() {
        await this.dealLunarCard(this.lunarPlayedCard);
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
        ++this.slotsFilled;
        const card = this.lunarHand[cardIndex];
        const slot = this.slots[slotId];
        this.lunarHand[cardIndex] = null;
        this.lunarPlayedCard = cardIndex;
        // Scale and translate animation...
        slot.card = card.element;
        slot.cardColor = "gray";
        await runAnimation(500,
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
        await runAnimation(150, new FlipCard1(card.element));
        card.element.classList.remove("back");
        card.element.classList.add("gray", moonPhases[card.phase]);
        await runAnimation(150, new FlipCard2(card.element));
        const patterns = backend._Glue_PutCard(
            this.board, slotId, card.phase, backendConst.PlayerBlack
        );
        await this.showAndDeletePatterns(patterns, slotId, "black");
        if (this.slotsFilled == this.slots.length) {
            this.endGameBonus();
        }
        else {
            this.userRound();
        }
    }
    scaleCards(slotIds, from, to) {
        return Promise.all(slotIds.map(slotId => runAnimation(
            200, new Scale(this.slots[slotId].card, to, from)
        )));
    }
    async showStarAt(x, y, color) {
        const star = newStar();
        starsDiv.append(star);
        star.style.left = gh(x);
        star.style.top = gh(y);
        star.classList.add(color);
        await runAnimation(150, new FadeIn(star));
        return new DisplayedStar(star, x, y);
    }
    async showStar(slotId, color) {
        const slot = this.slots[slotId];
        return await this.showStarAt(
            slot.centerPosXGh - halfCardSize,
            slot.centerPosYGh - halfCardSize,
            color
        );
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
            await runAnimation(300,
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
    async showAndDeletePatterns(patterns, subjectSlot, color) {
        let node = patterns;
        while (!backend._Glue_IsNull(node)) {
            const pattern = backend.getValue(
                node + backendConst.PatternNodePattern, '*'
            );
            const kind = backend._Glue_PatternKind(pattern);
            let text;
            let starredSlots;
            const occupiedSlots = [];
            let bonus = 0;
            switch (kind) {
            case backendConst.PkPhasePair: {
                text = "Phase Pair";
                const otherId = backend.getValue(
                    pattern + backendConst.PatternOtherId, int
                );
                starredSlots = [subjectSlot];
                occupiedSlots.push(subjectSlot, otherId);
                break;
            }
            case backendConst.PkFullMoon: {
                text = "Full Moon Pair";
                const otherId = backend.getValue(
                    pattern + backendConst.PatternOtherId, int
                );
                starredSlots = occupiedSlots;
                occupiedSlots.push(subjectSlot, otherId);
                break;
            }
            case backendConst.PkLunarCycle: {
                let node = backend.getValue(
                    pattern + backendConst.PatternList, '*'
                );
                while (!backend._Glue_IsNull(node)) {
                    occupiedSlots.push(backend.getValue(
                        node + backendConst.SlotNodeSlotId, int
                    ));
                    node = backend.getValue(
                        node + backendConst.SlotNodeNext, '*'
                    );
                }
                starredSlots = occupiedSlots;
                text = `Lunar Cycle of ${occupiedSlots.length}`;
                break;
            }
            default:
                throw `invalid pattern kind ${kind}`;
            }
            for (const slotId of occupiedSlots) {
                this.slots[slotId].setCardColor("gray");
            }
            await Promise.all([
                showDialogueBox(text),
                this.scaleCards(occupiedSlots, 1, largeCardScale),
            ]);
            await sleep(500);
            for (const slotId of occupiedSlots) {
                this.slots[slotId].setCardColor(color);
            }
            const [, ...stars] = await Promise.all([
                hideDialogueBox(),
                ...starredSlots.map(slotId => this.showStar(slotId, color)),
                // edges
            ]);
            await this.hideStars(stars, color);
            await this.scaleCards(occupiedSlots, largeCardScale, 1);
            if (bonus > 0) {
                const [, stars] = await Promise.all([
                    showDialogueBox("Wildcard bonus!"),
                    this.showBonusStars(bonus, color),
                ]);
                await sleep(500);
                await Promise.all([
                    hideDialogueBox(),
                    this.hideStars(stars, color),
                ]);
            }
            node = backend.getValue(
                node + backendConst.PatternNodeNext, '*'
            );
        }
        backend._PatternNode_DeleteChain(patterns);
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
        await sleep(1000);
        await showDialogueBox("The Half Moon's bonus points");
        await this.scaleCards(blackIds, 1, largeCardScale);
        const stars1 = await Promise.all(blackIds.map(
            slotId => this.showStar(slotId, "black")
        ));
        await this.hideStars(stars1, "black");
        await this.scaleCards(blackIds, largeCardScale, 1);
        await updateDialogueText("Your bonus points");
        await this.scaleCards(whiteIds, 1, largeCardScale);
        const stars2 = await Promise.all(whiteIds.map(
            slotId => this.showStar(slotId, "white")
        ));
        await this.hideStars(stars2, "white");
        await this.scaleCards(whiteIds, largeCardScale, 1);
        await hideDialogueBox();
        onExitGame();
    }
    uninstall() {
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

let game;

export function onTutorial() {}
export function onPlay() {
    enterScene("game-scene");
    game = new Game(4, Boards.ThreeByFour);
}
export function onCustomGame() {}
export function onExitGame() {
    game.uninstall();
    game = undefined;  // For GC
    enterScene("menu-scene");
}
