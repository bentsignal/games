document.addEventListener("DOMContentLoaded", () => {
    const starsWrapper = document.getElementById("stars-wrapper")
    // Four painted fields replace 500 independently animated elements.
    const fields = Array.from({ length: 4 }, (_, group) => {
        const field = document.createElement("div")
        field.className = "star"
        field.style.animationDuration = `${3 + group / 2}s`
        field.style.boxShadow = Array.from({ length: 125 }, () =>
            `${Math.random() * 100}vw ${Math.random() * 70}vh white`
        ).join(",")
        return field
    })
    starsWrapper.replaceChildren(...fields)
})
