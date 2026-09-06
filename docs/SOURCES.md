# Sources and provenance

The network and destination pairs/point values are factual game data; implementation and artwork are original.

- [Days of Wonder USA 1910](https://www.daysofwonder.com/game/ticket-to-ride-usa-1910/): expansion contents and modes.
- [Official USA 1910 rules](https://cdn.svc.asmodee.net/staging-daysofwonder/uploads/2024/07/7216-T2R1910-EN-2018-1.pdf): tickets, draws, keep counts, and bonuses.
- [Official Anniversary rules](https://cdn.svc.asmodee.net/production-asmodeees/uploads/2023/06/Reglas_TTR_USA_1910-1.pdf): explicit no-bonus Big Cities rule used here.
- [USA network CSV](https://github.com/Rob217/TicketToRideAnalysis/blob/master/data/USA/routes.csv) and [city positions](https://github.com/Rob217/TicketToRideAnalysis/blob/master/data/USA/city_locations.json): factual network reference. No repository implementation or map artwork copied.
- [Original destination reference](https://github.com/Rob217/TicketToRideAnalysis/blob/master/data/USA/tickets.csv): verifies original deck membership.
- [69-ticket Mega reference](https://www.supercheats.com/ticket-to-ride/wiki/1910-mega-game-map-master-routes-list), [35-ticket 1910 reference](https://www.supercheats.com/ticket-to-ride/wiki/1910-map-master-routes-list), [Big Cities reference](https://www.supercheats.com/ticket-to-ride/wiki/1910-big-cities-map-master-routes-list): destination pairs and revised point values.

Mystery Train tickets: Boston–Washington (4), Montreal–Chicago (7), Vancouver–Portland (2), Winnipeg–Omaha (6). Four Classic revisions: Los Angeles–New York 20, Los Angeles–Miami 19, Seattle–New York 20, Sault St. Marie–Oklahoma City 8.

The locomotive was created in Blender 5.2.1 through its Python console with `scripts/create_locomotive.py`, saved as `.blend`, and exported as `.glb`. This earlier 3D asset remains in the repository; the redesigned game uses original SVG train-car and conductor artwork. Fonts are self-hosted from Fontsource packages (Rye, Bree Serif, Fraunces, Manrope, IBM Plex Mono; SIL Open Font License). Icons are Lucide (ISC license).

Infrastructure references: [Convex pricing](https://www.convex.dev/pricing), [Convex usage FAQ](https://www.convex.dev/pricing/faq), [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite).

## Classic board redesign

- [Ticket to Ride Classic Edition on Steam](https://store.steampowered.com/app/108200/Ticket_to_Ride_Classic_Edition/): visual reference, reviewed in Helium. No screenshots, original card art, or original UI assets are bundled.
- [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/): geographic vector data is public domain. The board uses 1:50m country polygons, lakes and state/province boundary lines from [Natural Earth’s official data repository](https://github.com/nvkelso/natural-earth-vector/tree/master/geojson). `scripts/generate-map.mjs` projects all layers together using Albers equal-area conic, with one uniform scale and rotation. This is a stylized game atlas, not a navigation map.
- [Ticket to Ride Soundtrack — America](https://www.youtube.com/watch?v=jBZochITFMs): YouTube embed with persistent playback controls. The upload credits Michael Huang as composer. No audio is downloaded, extracted or bundled. [YouTube player documentation](https://developers.google.com/youtube/player_parameters) supplies the supported looping parameters and minimum visible player dimensions.
- The card, ticket, route-claim and turn cues in `src/audio.ts` are original Web Audio synthesis.

The user requested the decorative Gulf label to read “Gulf of America.” The atlas labels are presentation text, independent of routing data.

The current station arrangement and route approaches follow the Classic USA board reference supplied by the user. Every train piece has the same dimensions. Geographic coastlines, lakes and boundaries use one Albers projection with no local warping or shoreline offsets. Board stations and tracks are independent of geography, so coastal routes may cross water. `npm run test:map` protects the approved station/track geometry and checks land/water landmarks around Florida against the rendered basemap. Card and turn-whistle effects are original local Web Audio synthesis.
