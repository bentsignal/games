class Binds {
    constructor() {
        this.awaitingBind = false
        this.waitingFor = ""
        this.toggleMuteAll = "1"
        this.shuffle = ";"
        this.clear = " "
        this.emote = "2"
        this.chat = "3",
        this.popup = new Popup({
            id: "keybinds-popup",
            title: "Keybinds",
            content: `
                <div id="keybinds-popup-wrapper">
                    <div id="keybind-instructions">Press a key to change it</div>
                    <div id="keybinds-popup-container">
                        <div class="keybind" id="mute-keybind">
                            <p id="mute-all-keybind-value" class="bind wrapper">${this.toggleMuteAll}</p>
                            <p>Toggle mute all sounds</p>
                        </div>
                        <div class="keybind" id="shuffle-keybind">
                            <p id="shuffle-keybind-value" class="bind wrapper">${this.shuffle}</p>
                            <p>Shuffle letters</p>
                        </div>
                        <div class="keybind" id="clear-keybind">
                            <p id="clear-keybind-value" class="bind wrapper">Space</p>
                            <p>Clear letters</p>
                        </div>
                        <div class="keybind" id="emote-keybind">
                           <p id="emote-keybind-value" class="bind wrapper">${this.emote}</p>
                           <p>Open emote menu</p>
                        </div>
                        <div class="keybind" id="chat-keybind">
                            <p id="chat-keybind-value" class="bind wrapper">${this.chat}</p>
                            <p>Quickchat</p>
                        </div>
                    </div>
                </div>
            `,
            backgroundColor: "var(--charcoal)",
            titleColor: "white",
            textColor: "white",
            closeColor: "white",
            css: `
                .popup-body {
                    margin: 0 !important
                }
            `,
            loadCallback: () => {
                const wrapper = document.getElementById("keybinds-popup-wrapper")
                wrapper.innerHTML = wrapper.innerHTML.replaceAll("<p></p>", "")
                Array.from(document.getElementsByClassName("bind")).forEach((bind) => {
                    bind.addEventListener("click", this.awaitBind)
                })
            }
        })
    }

    awaitBind = (event) => {
        if (!this.awaitingBind) {
            this.waitingFor = event.target.id
            const bind = document.getElementById(this.waitingFor)
            bind.innerText = "..."
            this.awaitingBind = true
        }
    }

    setBind = (key) => {

        // determine placeholder value
        let value = ""
        if (key == " ") {
            value = "Space"
        }
        else {
            value = key
        }

        // change state variable
        if (this.waitingFor == "mute-all-keybind-value") {
            this.toggleMuteAll = key
        }
        else if (this.waitingFor == "shuffle-keybind-value") {
            this.shuffle = key
        }
        else if (this.waitingFor == "clear-keybind-value") {
            this.clear = key
        }
        else if (this.waitingFor == "emote-keybind-value") {
            this.emote = key
        }
        else if (this.waitingFor == "chat-keybind-value") {
            this.chat = key
        }

        // update ui
        document.getElementById(this.waitingFor).innerText = value
        this.awaitingBind = false
        this.waitingFor = ""
    }

    taken = (key) => {
        if (key == this.toggelMuteAll) {
            return true
        }
        else if (key == this.shuffle) {
            return true
        }
        else if (key == this.clear) {
            return true
        }
        else if (key == this.emote) {
            return true
        }
        else if (key == this.chat) {
            return true
        }
        else {
            return false
        }
    }

}

export default Binds