document.addEventListener("DOMContentLoaded", () => {
    const starsWrapper = document.getElementById("stars-wrapper")
    for (let i = 0; i < 500; i++) {
        starsWrapper.innerHTML += `
            <div class="star" style="
                top: calc(70vh * ${Math.random()});
                left: calc(100vw * ${Math.random()});
                animation: star-flicker ${Math.ceil(Math.random()*2)+2}s linear infinite;
            "></div>
        `
    }
})