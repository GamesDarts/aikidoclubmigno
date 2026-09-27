document.addEventListener("DOMContentLoaded", function () {
    const burgerBtn = document.getElementById("burger-btn");
    const nav = document.getElementById("main-nav");

    if (burgerBtn && nav) {
        burgerBtn.addEventListener("click", function () {
            nav.classList.toggle("open");
            burgerBtn.classList.toggle("open");
        });

        nav.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", function () {
                nav.classList.remove("open");
                burgerBtn.classList.remove("open");
            });
        });
    }

    const stagesCalendar = document.getElementById("stages-calendar");

    if (stagesCalendar) {
        loadStages(stagesCalendar);
    }

    const pastCarousel = document.getElementById("past-carousel");

    if (pastCarousel) {
        loadCarousel(pastCarousel);
    }

    const contactForm = document.getElementById("contact-form");
    const statusEl = document.getElementById("form-status");

    if (contactForm) {
        contactForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const submitBtn = contactForm.querySelector("button[type='submit']");
            const formData = new FormData(contactForm);

            submitBtn.disabled = true;
            submitBtn.textContent = "Envoi en cours...";
            if (statusEl) {
                statusEl.textContent = "";
                statusEl.className = "form-status";
            }

            fetch(contactForm.action, {
                method: "POST",
                body: formData,
                headers: { Accept: "application/json" }
            })
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    if (data.success) {
                        contactForm.reset();
                        if (statusEl) {
                            statusEl.textContent = "Merci, votre message a bien été envoyé ! Nous vous répondrons rapidement.";
                            statusEl.className = "form-status form-status-success";
                        }
                    } else {
                        throw new Error(data.message || "Erreur lors de l'envoi.");
                    }
                })
                .catch(function () {
                    if (statusEl) {
                        statusEl.textContent = "Une erreur est survenue. Vous pouvez aussi nous écrire directement à aikido.migno@gmail.com.";
                        statusEl.className = "form-status form-status-error";
                    }
                })
                .finally(function () {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Envoyer le message";
                });
        });
    }
});

/* ---- Calendrier des stages ----
   Lit le Google Sheet publié en CSV. Les colonnes sont repérées par leur
   nom d'en-tête (l'ordre dans le Sheet n'a pas d'importance) :
   « Type de stage », « Lieu », « Date début », « Date fin », « Stage fait »
   (facultative) ; toute autre colonne est affichée telle quelle.
   Les stages passés sont masqués, les autres triés par date croissante. */

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function normalize(text) {
    return (text || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function findColumn(header, pattern) {
    return header.findIndex(function (name) { return pattern.test(normalize(name)); });
}

function loadStages(container) {
    // Paramètre anti-cache : force Google à renvoyer la dernière version publiée
    const url = container.dataset.csv + "&t=" + Date.now();

    fetch(url, { cache: "no-store" })
        .then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.text();
        })
        .then(function (text) {
            const rows = parseCsv(text);
            const header = rows.shift() || [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const col = {
                type: findColumn(header, /type|^stage$/),
                place: findColumn(header, /lieu/),
                start: findColumn(header, /debut/),
                end: findColumn(header, /fin/),
                done: findColumn(header, /fait/)
            };
            if (col.type === -1) col.type = 0;

            const known = Object.values(col);
            const extraCols = header
                .map(function (name, i) { return i; })
                .filter(function (i) { return known.indexOf(i) === -1 && header[i].trim() !== ""; });

            const cell = function (row, i) { return i === -1 ? "" : (row[i] || "").trim(); };

            const stages = rows
                // Ignore les lignes vides ou qui n'ont qu'un type de stage sans autre info
                .filter(function (row) {
                    return row.some(function (value, i) { return i !== col.type && value.trim() !== ""; });
                })
                .map(function (row) {
                    const start = parseDate(cell(row, col.start));
                    const end = parseDate(cell(row, col.end)) || start;
                    return { row: row, start: start, end: end };
                })
                .filter(function (stage) { return !stage.end || stage.end >= today; })
                .sort(function (a, b) {
                    if (!a.start) return 1;
                    if (!b.start) return -1;
                    return a.start - b.start;
                });

            if (stages.length === 0) return;

            const thead = container.querySelector("thead");
            const tbody = container.querySelector("tbody");

            const headings = ["Stage", "Dates"];
            if (col.place !== -1) headings.push("Lieu");
            extraCols.forEach(function (i) { headings.push(header[i]); });
            if (col.done !== -1) headings.push("Statut");
            thead.appendChild(buildRow("th", headings));

            stages.forEach(function (stage) {
                const row = stage.row;
                const values = [
                    cell(row, col.type),
                    formatRange(stage.start, stage.end, cell(row, col.start), cell(row, col.end))
                ];
                if (col.place !== -1) values.push(cell(row, col.place) || "À préciser");
                extraCols.forEach(function (i) { values.push(cell(row, i)); });
                if (col.done !== -1) values.push(statusBadge(cell(row, col.done)));

                const tr = buildRow("td", values);
                if (col.done !== -1 && isYes(cell(row, col.done))) tr.classList.add("stage-done");
                tbody.appendChild(tr);
            });

            container.hidden = false;
            const emptyMessage = document.getElementById("stages-empty");
            if (emptyMessage) emptyMessage.hidden = true;
        })
        .catch(function () {
            // En cas d'erreur, le message « Prochaines dates à confirmer » reste affiché.
        });
}

function buildRow(cellTag, values) {
    const tr = document.createElement("tr");
    values.forEach(function (value) {
        const cell = document.createElement(cellTag);
        if (value instanceof Node) cell.appendChild(value);
        else cell.textContent = (value || "").trim();
        tr.appendChild(cell);
    });
    return tr;
}

function isYes(value) {
    return /^\s*oui\s*$/i.test(value || "");
}

function statusBadge(value) {
    if (!value || !value.trim()) return "";
    const badge = document.createElement("span");
    badge.className = "stage-status " + (isYes(value) ? "stage-status-done" : "stage-status-upcoming");
    badge.textContent = isYes(value) ? "Effectué" : "À venir";
    return badge;
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else cell += c;
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(cell); cell = "";
        } else if (c === "\n") {
            row.push(cell); rows.push(row); row = []; cell = "";
        } else if (c !== "\r") {
            cell += c;
        }
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

// Accepte « 10/01/2027 » ou « 3 mars 2027 » (et « 1er mars 2027 »).
function parseDate(value) {
    if (!value) return null;
    const text = value.trim().toLowerCase();

    let m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

    m = text.match(/^(\d{1,2})(?:er)?\s+([a-zéèêûô]+)\s+(\d{4})$/);
    if (m) {
        const month = MOIS.findIndex(function (name) {
            return name === m[2] || name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === m[2];
        });
        if (month !== -1) return new Date(+m[3], month, +m[1]);
    }
    return null;
}

function formatDay(date) {
    return (date.getDate() === 1 ? "1er" : date.getDate());
}

function formatRange(start, end, rawStart, rawEnd) {
    if (!start) return [rawStart, rawEnd].filter(Boolean).join(" – ") || "Dates à confirmer";

    const full = function (d) { return formatDay(d) + " " + MOIS[d.getMonth()] + " " + d.getFullYear(); };

    if (!end || end.getTime() === start.getTime()) return full(start);
    if (start.getFullYear() !== end.getFullYear()) return "Du " + full(start) + " au " + full(end);
    if (start.getMonth() !== end.getMonth()) {
        return "Du " + formatDay(start) + " " + MOIS[start.getMonth()] + " au " + full(end);
    }
    return "Du " + formatDay(start) + " au " + full(end);
}

/* ---- Carrousel des stages passés ----
   Liste les images du dossier Google Drive partagé (API Drive v3) et les
   affiche une par une. Les fichiers doivent être partagés « Tous les
   utilisateurs disposant du lien ». La description d'un fichier dans Drive
   sert de légende. Seules la photo affichée et ses voisines sont chargées. */

function loadCarousel(carousel) {
    const query = "'" + carousel.dataset.folder + "' in parents and mimeType contains 'image/' and trashed = false";
    const url = "https://www.googleapis.com/drive/v3/files"
        + "?q=" + encodeURIComponent(query)
        + "&fields=" + encodeURIComponent("files(id,name,description)")
        + "&orderBy=name&pageSize=1000"
        + "&key=" + carousel.dataset.key;

    // Envoie l'adresse complète de la page (et pas seulement le domaine),
    // pour correspondre aux restrictions de sites web de la clé API.
    fetch(url, { referrerPolicy: "no-referrer-when-downgrade" })
        .then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.json();
        })
        .then(function (data) {
            const photos = data.files || [];
            if (photos.length > 0) buildCarousel(carousel, photos);
        })
        .catch(function () {
            // En cas d'erreur, la section reste affichée sans carrousel.
        });
}

function buildCarousel(carousel, photos) {
    const track = carousel.querySelector(".carousel-track");
    const prevBtn = carousel.querySelector(".carousel-prev");
    const nextBtn = carousel.querySelector(".carousel-next");
    const caption = carousel.querySelector(".carousel-caption");
    const counter = carousel.querySelector(".carousel-counter");
    let index = 0;

    const slides = photos.map(function (photo, i) {
        const slide = document.createElement("div");
        slide.className = "carousel-slide";
        slide.setAttribute("role", "group");
        slide.setAttribute("aria-label", "Photo " + (i + 1) + " sur " + photos.length);
        const img = document.createElement("img");
        img.alt = photo.description || "Photo d'un stage passé du club";
        img.dataset.src = "https://lh3.googleusercontent.com/d/" + photo.id + "=w1600";
        slide.appendChild(img);
        track.appendChild(slide);
        return slide;
    });

    function loadImage(i) {
        const img = slides[(i + slides.length) % slides.length].querySelector("img");
        if (!img.src) img.src = img.dataset.src;
    }

    function show(i) {
        index = (i + slides.length) % slides.length;
        track.style.transform = "translateX(-" + (index * 100) + "%)";
        loadImage(index);
        loadImage(index + 1);
        loadImage(index - 1);
        caption.textContent = photos[index].description || "";
        counter.textContent = (index + 1) + " / " + slides.length;
        slides.forEach(function (slide, j) { slide.setAttribute("aria-hidden", j !== index); });
    }

    prevBtn.addEventListener("click", function () { show(index - 1); });
    nextBtn.addEventListener("click", function () { show(index + 1); });

    carousel.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") show(index - 1);
        if (e.key === "ArrowRight") show(index + 1);
    });

    // Balayage au doigt sur mobile
    let touchStartX = null;
    track.addEventListener("touchstart", function (e) { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", function (e) {
        if (touchStartX === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) > 40) show(index + (delta < 0 ? 1 : -1));
        touchStartX = null;
    });

    if (slides.length === 1) {
        prevBtn.hidden = true;
        nextBtn.hidden = true;
    }

    show(0);
    carousel.hidden = false;
}
