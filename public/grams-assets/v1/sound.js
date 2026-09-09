class Sound {

    constructor() {

        // parent levels
        this.parentLevels = {
            music: 0.5,
            sfx: 0.8,
        }

        // child levels
        this.childLevels = {
            music: 0.1,
            invalidWord: 1,
            validWord: 1,
            win: 1,
            lose: 1,
            start: 0.08,
            emote: 0.1,
            chat: 0.1,
            fiveSeconds: 1
        }

        // sounds
        this.music = new Audio("./sounds/george_st_shuffle.mp3")
        this.invalidWord =  new Audio("./sounds/bad.mp3")
        this.validWord = new Audio("./sounds/good.mp3")
        this.win = new Audio("./sounds/win.mp3")
        this.lose = new Audio("./sounds/lose.mp3")
        this.start = new Audio("./sounds/start.mp3")
        this.chat = new Audio("./sounds/chat.mp3")
        this.emote = new Audio("./sounds/emote.mp3")
        this.fiveSeconds = new Audio("./sounds/5_seconds_left.mp3")

        this.initializeVolume()

        this.music.loop = true

        // controls
        this.controls = new Popup({
            id: "volume-controls",
            title: "Volume",
            backgroundColor: "var(--charcoal)",
            titleColor: "white",
            textColor: "white",
            closeColor: "white",
            content: `
                <div id="volume-controls-wrapper">
                    <div id="sfx-controls-container">
                        <div id="sfx-controls-wrapper">
                            <p>SFX</p>
                            <input type="range" min="0" max="100" value=${this.parentLevels.sfx*100} id="sfx-slider" class="volume-slider">
                        </div>
                    </div>
                    <div id="music-controls-container">
                        <div id="music-controls-wrapper">
                            <p>Music</p>
                            <input type="range" min="0" max="100" value=${this.parentLevels.music*100} id="music-slider" class="volume-slider">
                        </div>
                    </div>
                </div>
            `,
            loadCallback: this.updateVolume
        })

    }

    initializeVolume = () => {
        this.music.volume = this.childLevels.music * this.parentLevels.music
        this.invalidWord.volume = this.childLevels.invalidWord * this.parentLevels.sfx
        this.validWord.volume = this.childLevels.validWord * this.parentLevels.sfx
        this.win.volume = this.childLevels.win * this.parentLevels.sfx
        this.lose.volume = this.childLevels.lose * this.parentLevels.sfx
        this.start.volume = this.childLevels.start * this.parentLevels.sfx
        this.emote.volume = this.childLevels.emote * this.parentLevels.sfx
        this.fiveSeconds.volume = this.childLevels.fiveSeconds * this.parentLevels.sfx
        this.chat.volume = this.childLevels.chat * this.parentLevels.sfx
    }

    updateVolume = () => {
        const sfxSlider = document.getElementById("sfx-slider")
        const musicSlider = document.getElementById("music-slider")
        sfxSlider.addEventListener("input", () => {
            this.parentLevels.sfx = document.getElementById("sfx-slider").value / 100
            this.invalidWord.volume = this.parentLevels.sfx * this.childLevels.invalidWord
            this.validWord.volume = this.parentLevels.sfx * this.childLevels.validWord
            this.win.volume = this.parentLevels.sfx * this.childLevels.win
            this.lose.volume = this.parentLevels.sfx * this.childLevels.lose
            this.start.volume = this.parentLevels.sfx * this.childLevels.start
            this.emote.volume = this.parentLevels.sfx * this.childLevels.emote
            this.chat.volume = this.parentLevels.sfx * this.childLevels.chat
            this.fiveSeconds.volume = this.parentLevels.sfx * this.childLevels.fiveSeconds
        })
        musicSlider.addEventListener("input", () => {
            this.parentLevels.music = document.getElementById("music-slider").value / 100
            this.music.volume = this.parentLevels.music * this.childLevels.music
        })
    }

    toggleMuteAll = () => {
        this.music.muted = !this.music.muted
        this.invalidWord.muted = !this.invalidWord.muted
        this.validWord.muted = !this.validWord.muted
        this.win.muted = !this.win.muted
        this.lose.muted = !this.lose.muted
        this.start.muted = !this.start.muted
        this.emote.muted = !this.emote.muted
        this.fiveSeconds.muted = !this.fiveSeconds.muted
        this.chat.muted = !this.chat.muted 
    }
    
}

export default Sound