const states = {
    home: 0,
    preGame: 1,
    midGame: 2,
    postGame: 3,
    spectate: 4,
}

class State {

    constructor() {
        this.current = states.home
        this.settingsOpen = false
        this.messageCount = 0
        this.render()
    }

    validState = (state) => {
        if (state == states.home) {
            return true
        }
        else if (state == states.preGame) {
            return true
        }
        else if (state == states.midGame) {
            return true
        }
        else if (state == states.postGame) {
            return true
        }
        else if (state == states.spectate) {
            return true
        }
        else {
            return false
        }
    }

    changeState = (state) => {
        if (this.validState(state)) {
            this.current = state
            this.render()
        }
    }

    render = () => {
        if (this.current == states.home) {
            this.renderHome()
        }
        else if (this.current == states.preGame) {
            this.renderPreGame()
        }
        else if (this.current == states.midGame) {
            this.renderMidGame()
        }
        else if (this.current == states.postGame) {
            this.renderPostGame()
        }
        else if (this.current == states.spectate) {
            console.log("render spectate")
        }
        else {
            console.log("invalid state")
        }
    }

    renderHome = () => {
        // hide
        document.getElementById("game-container").style.display = "none"
        document.getElementById("player-list-container").style.display = "none"
        document.getElementById("chat-container").style.display = "none"
        document.getElementById("timer-container").style.display = "none"
        document.getElementById("settings-wheel-container").style.display = "none"
        document.getElementById("controls-container").style.display = "none"
        document.getElementById("leave").style.display = "none"
        document.getElementById("pre-game-container").style.display = "none"
        document.getElementById("results-wrapper").style.display = "none"
        document.getElementById("emote-button").style.display = "none"
        // show
        document.getElementById("home-container").style.display = "flex"

    }

    renderPreGame = () => {
        // hide
        document.getElementById("home-container").style.display = "none"
        document.getElementById("game-container").style.display = "none"
        document.getElementById("results-wrapper").style.display = "none"
        // show
        document.getElementById("player-list-container").style.display = "block"
        document.getElementById("chat-container").style.display = "block"
        document.getElementById("leave").style.display = "block"
        document.getElementById("settings-wheel-container").style.display = "block"
        document.getElementById("pre-game-container").style.display = "flex"
        document.getElementById("emote-button").style.display = "block"

    }

    renderMidGame = () => {
        //hide
        document.getElementById("home-container").style.display = "none"
        document.getElementById("pre-game-container").style.display = "none"
        document.getElementById("results-wrapper").style.display = "none"
        //show
        document.getElementById("game-container").style.display = "flex"
        document.getElementById("game-wrapper").style.display = "block"
        document.getElementById("player-list-container").style.display = "block"
        document.getElementById("chat-container").style.display = "block"
        document.getElementById("leave").style.display = "block"
        document.getElementById("settings-wheel-container").style.display = "block"
        document.getElementById("emote-button").style.display = "block"
    }

    renderPostGame = () => {
        //hide
        document.getElementById("home-container").style.display = "none"
        document.getElementById("pre-game-container").style.display = "none"
        document.getElementById("game-wrapper").style.display = "none"
        //show
        document.getElementById("game-container").style.display = "flex"
        document.getElementById("results-wrapper").style.display = "flex"
        document.getElementById("player-list-container").style.display = "block"
        document.getElementById("chat-container").style.display = "block"
        document.getElementById("leave").style.display = "block"
        document.getElementById("settings-wheel-container").style.display = "block"
        document.getElementById("emote-button").style.display = "block"
    }

}

export {states, State}