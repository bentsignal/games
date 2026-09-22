import { shuffle } from "./utils.js"
import Letter from "./letter.js"
import {states, State} from "./state.js"

class Game {
    
    constructor() {
        this.name = ""
        this.id = ""
        this.inGame = false
        this.state = new State()
        this.midGame = false
        this.word = ""
        this.lettersAvailable = []
        this.lettersUsed = []
        this.wordSize = 6
        this.wordScore = {
            1: 5,
            2: 10, 
            3: 50,
            4: 100,
            5: 300,
            6: 600,
            7: 1000,
            8: 2000
        }
        this.players = []
    }

    joined = (name) => {
        this.inGame = true
        this.name = name
        this.state.changeState(states.preGame)
    }

    left = () => {
        this.inGame = false
        this.lettersUsed = []
        this.lettersAvailable = []
        this.players = []
        this.updateDeck()
    }

    reset = () => {
        this.midGame = false
        this.lettersUsed = []
        this.lettersAvailable = []
        this.resetWordList()
        this.updateDeck()
    }

    crash = () => {
        this.reset()
        this.inGame = false
        this.players = []
        this.word = ""
        this.name = ""
        this.id = ""
        this.state = new State()
        this.state.changeState(states.home)
        document.getElementById("wordCount").inenrText = "Words: 0"
        document.getElementById("myScore").innerText = "Score: 0"
    }

    resetWordList = () => {
        document.getElementById("words-wrapper").innerHTML = `
            <div id="words-8" class="word-class">
            </div>
            <div id="words-7">
            </div>
            <div id="words-6">
            </div>
            <div id="words-5">
            </div>
            <div id="words-4">
            </div>
            <div id="words-3">
            </div>
            <div id="words-2">
            </div>
            <div id="words-1">
            </div>
        `
    }

    updateDeck = () => {
        const availableWrapper = document.getElementById("letters-available-wrapper")
        const usedWrapper = document.getElementById("letters-used-wrapper")
        const size = this.inGame && this.midGame ? this.lettersAvailable.length : 0
        // Keep the tile nodes alive while typing. Only changed text/classes need painting.
        for (const [wrapper, prefix, className] of [
            [availableWrapper, "letters-available", "letter-available"],
            [usedWrapper, "letter-used", "letter-used"]
        ]) {
            if (wrapper.children.length !== size) {
                const tiles = Array.from({ length: size }, (_, i) => {
                    const tile = document.createElement("p")
                    tile.id = `${prefix}-${i + 1}`
                    tile.className = className
                    return tile
                })
                wrapper.replaceChildren(...tiles)
            }
            for (let i = 0; i < size; i++) {
                const value = wrapper === availableWrapper
                    ? (this.lettersAvailable[i].available ? this.lettersAvailable[i].value : "")
                    : (this.lettersUsed[i] || "")
                const tile = wrapper.children[i]
                const nextClass = `${className} ${value ? "filled" : "empty"}`
                if (tile.textContent !== value) tile.textContent = value
                if (tile.className !== nextClass) tile.className = nextClass
            }
        }
    }

    removeLetter = () => {
        const letterRemoved = this.lettersUsed.pop()
        let found = false
        this.lettersAvailable.forEach((letter) => {
            if (!found && letter.value == letterRemoved && !letter.available) {
                found = true
                letter.available = true
            }
        })
        this.updateDeck()
    }

    newLetters = (letters) => {
        if (this.inGame) {
            this.wordSize = letters.length
            letters.forEach((letter) => {
                this.lettersAvailable.push(new Letter(letter))
            })
            this.lettersUsed = []
            this.updateDeck()
        }
    }

    playLetter = (key) => {
        key = key.toLowerCase()
        let found = false
        for (let i = 0; i < this.lettersAvailable.length; i++) {
            if (!found && this.lettersAvailable[i].value == key && this.lettersAvailable[i].available) {
                found = true
                this.lettersAvailable[i].available = false
                this.lettersUsed.push(key.toLowerCase())
                this.updateDeck()
            }
        }
        
    }

    isLetterAvailable = (key) => {
        let available = false
        this.lettersAvailable.forEach((letter) => {
            if (letter.value == key && letter.available) {
                available = true
            }
        })
        return available
    }

    anyLettersPlayed = () => {
        return this.lettersUsed.length > 0
    }

    getWord = () => {
        let word = ""
        this.lettersUsed.forEach((letter) => {
            word += letter
        })
        return word
    }
    
    shuffleLetters = () => {
        shuffle(this.lettersAvailable)
        this.updateDeck()
    }

    clearPlayedLetters = () => {
        this.lettersUsed = []
        this.lettersAvailable.forEach((letter) => {
            letter.available = true
        })
        this.updateDeck()
    }


}

export default Game