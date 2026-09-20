const leave = document.getElementById("leave")
const playerList = document.getElementById("player-list-wrapper")
const chatInput = document.getElementById("chat-input")
const chat = document.getElementById("chat")
const joinErrors = document.getElementById("join-errors")
const wordCount = document.getElementById("wordCount")
const myScore = document.getElementById("myScore")
const username = document.getElementById("username")
const timerContainer = document.getElementById("timer-container")
const timer = document.getElementById("timer")
const start = document.getElementById("start")
const controls = document.getElementById("controls-container")
const gameWrapper = document.getElementById("game-wrapper")
const resultsWrapper = document.getElementById("results-wrapper")
const volumeButton = document.getElementById("volume-button")
const pfpButton = document.getElementById("pfp-button")
const keybindsButton = document.getElementById("keybinds-button")

import { cfg } from "./cfg.js"
import { states } from "./state.js"
import Game from "./game.js"
import Sound from "./sound.js"
import Popups from "./popups.js"
import Binds from "./binds.js"

import { socket } from "./transport.js"
let game = new Game()
const sound = new Sound()
const binds = new Binds()

let gameTimer = 0
let gameCountdown = 0

/*

    Send message to chat

*/
const sendMessage = () => {
    const name = game.name
    const message = chatInput.value
    let allowMessage = checkMessage(message)
    if (allowMessage) {
        socket.emit("chatSent", {
            sender: name,
            message: message
        })
        chatInput.value = ""
    } 
}

const checkMessage = (message) => {
    return true
}

const clearIntervals = () => {
    if (gameCountdown != 0) {
        clearInterval(gameCountdown)
    }
    if (gameTimer != 0) {
        clearInterval(gameTimer)
    }
}

const resetLobby = () => {
    sound.music.pause()
    game.state.changeState(states.home)
    wordCount.innerText = "Words: 0"
    myScore.innerText = "Score: 0"
    clearIntervals()
    game.left()
    game.reset()
    game.word = ""
    renderPlayerList()
    document.getElementById("pre-game-waiting").style.display = "block"
    document.getElementById("pre-game-countdown").style.display = "none"
    chat.innerHTML = ""
    chatInput.value = ""
}
const leaveGame = () => {
    socket.emit("leave")
    resetLobby()
}
socket.on("lobbyReset", resetLobby)

/*

    Request server check if word being played is valid

*/
const playWord = () => {
    if (game.midGame && game.anyLettersPlayed()) {
        const word = game.getWord()
        socket.emit("wordSubmit", {
            word: word
        })
    }
    else {
        declinedAnimation()
    }
}

/*

    Animation played when server responds that word 
    being played is not in dictionary 

*/
const declinedAnimation = () => {
    let empty = document.getElementsByClassName("empty")
    for (let i = 0; i < empty.length; i++) {
        empty[i].style.backgroundColor = "red"
    }
    setTimeout(() => {
        for (let i = 0; i < empty.length; i++) {
            empty[i].style.backgroundColor = "white"
        }
    }, 500)
}

const renderPlayerList = () => {
    playerList.innerHTML = ""
    game.players.forEach((player) => {
        if (player.id == socket.id) {
            document.getElementById("my-pfp").src = `images/${player.pfp}`
        }
        playerList.innerHTML += `
            <div id="player-${player.id}" class="player wrapper">
                <img src="images/${player.pfp}" class="pfp-player-list" id="${player.id}-pfp-list">
                <div class="player-info">
                    <div class="player-name" id="${player.id}-name-list">
                        ${player.name}
                    </div>
                    <div class="player-score" id="${player.id}-score-list">
                        Score: ${player.score}
                    </div>
                    <div class="player-wins" id="${player.id}-wins-list">
                        Wins: ${player.wins}
                    </div>
                </div>
                <div id="${player.id}-emote-wrapper"class="player-emote-wrapper">
                    <img src="icons/speech-bubble-stroke.svg" class="speech-bubble stroke">
                    <img src="icons/speech-bubble-fill.svg" class="speech-bubble fill">
                    <img src="images/ben-emote-2.jpg" class="emote" id="${player.id}-emote">
                </div>
            </div>
        `
    })
}

const startCountdown = (letters) => {
    game.state.changeState(states.preGame)
    const message = document.getElementById("pre-game-waiting")
    const countdownText = document.getElementById("pre-game-countdown")
    message.style.display = "none"
    countdownText.style.display = "block"
    sound.start.play().catch(() => {})
    let countdown = 3
    countdownText.innerText = ""
    gameCountdown = setInterval(() => {
        if (countdown <= 0) {
            clearInterval(gameCountdown)
            startTimer(59)
            game.state.changeState(states.midGame)
            game.newLetters(letters)
            countdownText.style.display = "none"
            message.style.display = "block"
        }
        countdownText.innerText = countdown
        countdown -= 1
    }, 1000)
}

const startTimer = (countdown) => {
    timerContainer.style.display = "flex"
    timer.innerText = "1:00"
    gameTimer = setInterval(() => {
        if (countdown < 0) {
            timerContainer.style.display = "none"
            timer.innerText = "1:00"
            clearInterval(gameTimer)
        }
        else if (countdown < 10) {
            timer.innerText = `0:${0}${countdown}`
        }
        else {
            timer.innerText = `0:${countdown}`
        }
        if (countdown == 4) {
            sound.fiveSeconds.play().catch(() => {})
        }
        countdown -= 1
    }, 1000)
}

const renderResults = () => {
    if (game.players.length > 2) {
        resultsWrapper.style.justifyContent = ""
    }
    else {
        resultsWrapper.style.justifyContent = "center"
    }
    resultsWrapper.innerHTML = `
        <p id="wordChoosen">Word: ${game.word}</p>
        <div id="results-container"></div>
    `
    game.players.forEach((player) => {
        let words = ""
        player.words.forEach((word) => {
            words += `
                <div class="word">
                    <p style="font-size:${10+(word.length*2)}pt">${word}</p>
                    <p style="font-size:${10+(word.length*2)}pt">${game.wordScore[word.length]}</p>
                </div>
            `
        })
        document.getElementById("results-container").innerHTML += `
            <div class="player-result wrapper">
                <div class="player-result-top-w">
                    <div class="player-result-top-c">
                        <div class="result-pfp-wrapper">
                            <img class="result-pfp" src="images/${player.pfp}">
                        </div>
                        <div class="result-info-wrapper">
                            <p class="result-name">${player.name}</p>
                            <p class="result-word-count">Words: ${player.words.length}</p>
                            <p class="result-score">Score: ${player.score}</p>
                        </div>
                    </div>
                </div>
                <div class="player-result-bottom-w">
                    <div class="player-result-bottom-c">
                        <p>Words</p>
                        <div class="result-word-list-w">
                            <div class="result-word-list-c">
                                <div class="result-words">
                                    ${words}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
    })
}

const pfpChange = (event) => {
    popups.pfp.hide()
    const pfpNew = `${event.target.id}.jpg`
    socket.emit("pfpRequestChange", {
        new: pfpNew
    })
}

const setUsername = () => {
    username.innerText = game.name
    const width = username.clientWidth
    if (width <= 150) {
        username.style.fontSize = "28pt"
    }
    else if (width > 150 && width <= 220) {
        username.style.fontSize = "20pt"
    }
    else if (width > 220) {
        username.style.fontSize = "15pt"
    }
}

const sendEmote = (event) => {
    if (game.inGame) {
        popups.emote.hide()
        const emote = event.target.id
        socket.emit("emoteSent", {
            emote: emote
        })
    }
}

/*



    Button and input event listeners



*/

leave.addEventListener("click", () => {
    leaveGame()
})

start.addEventListener("click", () => {
    socket.emit("requestStart", {
        size: document.getElementById("select-word-size").value
    })
})

volumeButton.addEventListener("click", () => {
    if (game.state.settingsOpen) {
        sound.controls.show()
    }
})

pfpButton.addEventListener("click", () => {
    if (game.state.settingsOpen) {
        socket.emit("pfpLoadAvailable")
        popups.pfp.show()
    }
})

keybindsButton.addEventListener("click", () => {
    if (game.state.settingsOpen) {
        binds.popup.show()
    }
})

document.addEventListener("keydown", (evt) => {
    if (binds.awaitingBind) {
        binds.setBind(evt.key)
    }
    else if (document.activeElement == document.body) {
        // focus game
        if (game.inGame) {
            if (evt.key == "Backspace") {
                if (game.lettersUsed.length > 0) {
                    game.removeLetter()
                }
            }
            else if (evt.key == "Enter" && game.midGame) {
                playWord() 
            }
            else if (game.midGame && game.isLetterAvailable(evt.key.toLowerCase())) {
                game.playLetter(evt.key)
            }
            else if (evt.key == binds.clear && game.lettersUsed.length > 0) {
                game.clearPlayedLetters()
            }
            else if (evt.key == binds.shuffle) {
                game.shuffleLetters()
            }
            else if (evt.key == binds.toggleMuteAll) {
                sound.toggleMuteAll()
            }
            else if (evt.key == binds.emote) {
                popups.emote.show()
            }
            else if (evt.key == binds.chat) {
                if (document.activeElement != chatInput) {
                    chatInput.focus()
                    setTimeout(() => {
                        chatInput.value = ""
                    },1)
                }
            }
        }
    }
    else if (document.activeElement == chatInput) {
        // chat
        if (evt.key == "Enter") {
            sendMessage()
        }
    }

})

document.getElementById("emote-button").addEventListener('click', () => {
    if (game.inGame) {
        popups.emote.show()
    }
})

const settingsWheel = document.getElementById("settings-wheel")
const settingsWrapper = document.getElementById("settings-wheel-wrapper")
settingsWheel.addEventListener("click", () => {
    if (game.state.settingsOpen) {
        volumeButton.style.transition = "top .5s ease-in-out, opacity .3s ease-in-out"
        pfpButton.style.transition = "top .5s ease-in-out, opacity .3s ease-in-out"
        keybindsButton.style.transition = "top .5s ease-in-out, opacity .3s ease-in-out"
        settingsWrapper.style.height = "50px"
        settingsWheel.classList.add("counter-clockwise")
        settingsWheel.classList.remove("clockwise")
        volumeButton.style.opacity = "0"
        pfpButton.style.opacity = "0"
        keybindsButton.style.opacity = "0"
        volumeButton.style.cursor = "default"
        pfpButton.style.cursor = "default"
        keybindsButton.style.cursor = "default"
        volumeButton.style.top = "-50px"
        pfpButton.style.top = "-100px"
        keybindsButton.style.top = "-150px"
        game.state.settingsOpen = false
    }
    else {
        volumeButton.style.transition = "top .5s ease-in-out, opacity 1s ease-in-out"
        pfpButton.style.transition = "top .5s ease-in-out, opacity 1s ease-in-out"
        keybindsButton.style.transition = "top .5s ease-in-out, opacity 1s ease-in-out"
        settingsWrapper.style.height = "225px";
        settingsWheel.classList.remove("counter-clockwise")
        settingsWheel.classList.add("clockwise")
        volumeButton.style.opacity = "1"
        pfpButton.style.opacity = "1"
        keybindsButton.style.opacity = "1"
        volumeButton.style.cursor = "pointer"
        pfpButton.style.cursor = "pointer"
        keybindsButton.style.cursor = "pointer"
        volumeButton.style.top = "10px"
        pfpButton.style.top = "20px"
        keybindsButton.style.top = "30px"
        game.state.settingsOpen = true
        
    }
})

/*



    Socket event listeners



*/

socket.on("connect", () => {
    // Convex manages reconnection; the legacy popup has no DOM until opened.
})

socket.on("connect_error", (error) => {
    game.crash()
    renderPlayerList()
    clearIntervals()
    joinErrors.innerHTML =  ""
    sound.music.pause()
    popups.lostConnection.show()
})

socket.on("joinAccepted", (data) => {
    sound.music.play().catch(() => {
        const retryMusic = () => {
            document.removeEventListener("pointerdown", retryMusic)
            document.removeEventListener("keydown", retryMusic)
            if (game.inGame) sound.music.play().catch(() => {})
        }
        document.addEventListener("pointerdown", retryMusic, { once: true })
        document.addEventListener("keydown", retryMusic, { once: true })
    })
    game.joined(data.name)
    game.state.changeState(states.preGame)
    setUsername()
    socket.emit("requestPlayers")
})

socket.on("joinDeclined", (data) => {
    joinErrors.innerHTML += `
        <p class="bad">${data.message}</p> 
    `
})

socket.on("newHost", (data) => {
    controls.style.display = game.inGame && data.id == socket.id ? "flex" : "none"
})

socket.on("updatePlayers", (data) => {
    if (game.inGame) {
        game.players = data.players
        renderPlayerList()
    }
})

socket.on("newMessage", (data) => {
    if (game.inGame) {
        const sender = data.sender
        const message = data.message
        const me = game.name
        game.state.messageCount += 1
        if (sender == "Server") {
            chat.innerHTML += `
                <p id="message-${game.state.messageCount}">
                    <span class="server-message ${data.type}">${message}</span>
                </p>
            `
        }
        else if (sender == me) {
            chat.innerHTML += `
                <p id="message-${game.state.messageCount}">
                    <span class="my-message">${me}: </span>
                    <span class="chat-message">${message}</span>
                </p>
            `
        }
        else {
            sound.chat.play().catch(() => {})
            chat.innerHTML += `
                <p id="message-${game.state.messageCount}">
                    <span class="chat">${sender}: </span>
                    <span class="chat-message">${message}</span>
                </p>
            `
        }
        document.getElementById(`message-${game.state.messageCount}`).scrollIntoView()
    }
})

socket.on("emoteReceived", (data) => {
    if (game.inGame) {
        sound.emote.play().catch(() => {})
        const emote = data.emote
        const id = data.id
        const emoteElement = document.getElementById(`${id}-emote`)
        const emoteWrapper = document.getElementById(`${id}-emote-wrapper`)
        emoteElement.src = `images/${emote}.jpg`
        emoteWrapper.classList.remove("three-s-fade")
        void emoteWrapper.offsetWidth
        emoteWrapper.classList.add("three-s-fade")
    }
})

socket.on("pfpAvailable", (data) => {
    const ben = data.ben
    const lukas = data.lukas
    let id = ""
    document.getElementById("pfp-list-row-ben").innerHTML = ""
    document.getElementById("pfp-list-row-lukas").innerHTML = ""
    ben.forEach((pfpBen) => {
        id = pfpBen.replace(".jpg", "")
        document.getElementById("pfp-list-row-ben").innerHTML += `
            <img src="images/${pfpBen}" class="pfp-list" id="${id}">
        `
    })
    lukas.forEach((pfpLukas) => {
        id = pfpLukas.replace(".jpg", "")
        document.getElementById("pfp-list-row-lukas").innerHTML += `
            <img src="images/${pfpLukas}" class="pfp-list" id="${id}">
        `
    })
    Array.from(document.getElementsByClassName("pfp-list")).forEach((pfp) => {
        pfp.addEventListener("click", pfpChange)
    })
})

socket.on("updatePlayerPfp", (data) => {
    document.getElementById(`${data.id}-pfp-list`).src = `images/${data.pfp}`
    if (data.id == socket.id) {
        document.getElementById("my-pfp").src = `images/${data.pfp}`
    }
})

socket.on("startGame", (data) => {
    if (game.inGame) {
        game.reset()
        game.midGame = true
        wordCount.innerText = "Words: 0"
        myScore.innerText = "Score: 0"
        startCountdown(data.letters)
    }
})

socket.on("wordAccept", (data) => {
    sound.validWord.play().catch(() => {})
    const word = data.word
    const me = data.player
    const points = data.points
    const length = word.length
    game.clearPlayedLetters()
    document.getElementById(`words-${length}`).innerHTML += `
        <div class="word" style="font-size:${10+(length*2)}pt">
            <p>${word}</p>
            <p>${points}</p>
        </div>
    `
    wordCount.innerText = `Words: ${me.words.length}`
    myScore.innerText = `Score: ${me.score}`
})

socket.on("wordDecline", (data) => {
    game.clearPlayedLetters()
    sound.invalidWord.play().catch(() => {})
    declinedAnimation()
})

socket.on("updatePlayerScore", (data) => {
    document.getElementById(`${data.id}-score-list`).innerText = `Score: ${data.score}`
})

socket.on("youWon", () => {
    sound.win.play().catch(() => {})
})

socket.on("youLost", () => {
    sound.lose.play().catch(() => {})
})

socket.on("gameOver", (data) => {
    if (game.inGame) {
        game.players = data.players
        renderPlayerList()
        game.reset()
        wordCount.innerText = `Words: 0`
        myScore.innerText = `Score: 0`
        game.word = data.word
        renderResults()
        game.state.changeState(states.postGame)
    }
})

socket.on("serverCrash", () => {
    game = new Game()
    renderPlayerList()
})

// declarations with callbacks passed by value
const popups = new Popups(sendEmote, leaveGame)
socket.on("resumeGame", data => {
    clearIntervals()
    game.reset()
    game.midGame = true
    game.state.changeState(states.midGame)
    game.newLetters(data.letters)
    startTimer(data.remaining)
    for (const word of data.me?.words || []) {
        document.getElementById(`words-${word.length}`).innerHTML += `<div class="word" style="font-size:${10+word.length*2}pt"><p>${word}</p><p>${game.wordScore[word.length]}</p></div>`
    }
    wordCount.innerText = `Words: ${data.me?.words.length || 0}`
    myScore.innerText = `Score: ${data.me?.score || 0}`
})
