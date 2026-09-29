NEXO v2 — clean rebuild

WHAT CHANGED
This is a new codebase. It does not reuse the old giant HTML/JSON-file architecture.

Requirements:
- Node.js 22.5 or newer.
- No npm install is required. NEXO v2 uses Node's built-in HTTP, crypto, and SQLite modules.

Start on Windows:
1. Unzip the folder.
2. Double-click START_NEXO.bat.
3. Keep the server window open.
4. The site opens at http://localhost:3000.

Networking:
- One NEXO server = one shared community/database.
- Other devices on the same permitted local network can use one of the LAN URLs printed in the server window.
- Everyone must use the SAME server to share accounts, friends, messages, groups, and music.
- Managed school/work networks may block local servers; NEXO does not bypass network controls.

Data:
- Windows: %LOCALAPPDATA%\\NEXO-v2
- macOS/Linux: ~/.nexo-v2
- SQLite database: nexo.sqlite
- Uploaded profile pictures/music: uploads/
- Passwords are stored as salted scrypt hashes, never plaintext.
- Sessions are HttpOnly cookies.

Browser:
- Search input uses Bing search URLs.
- NEXO attempts to display pages in an iframe.
- Some websites (including potentially search pages) can refuse iframe embedding with CSP/X-Frame-Options. NEXO does not and cannot override those website security policies.

Current features:
- Username/password accounts, optional private email
- Persistent login sessions
- Profile bio + cropped PFP
- User search, friend requests, friend list
- Direct messages
- Groups with channels and group messages
- Public/private song uploads, recent music, search, playback
- Browser tabs + Bing search
- Browser and chat color customization
- Games placeholder


NEXO v2.1 fixes
- Fixed PFP cropper measuring width 0 while hidden.
- Added PFP preview, drag clamp, upload feedback, and immediate refresh.
- Added always-visible mini music controls in the browser bar: previous, play/pause, next, title, time, and seek.
- Music keeps playing while changing NEXO tabs.
- Clicking the account avatar now opens View Profile, Settings, and Log Out from anywhere.


NEXO v2.2 CHAT + TAB FIX
- Home, Music, People, Chat, Games, and Settings now open as real NEXO tabs in the top tab strip.
- Web pages and NEXO app pages share the same tab strip and can be switched/closed independently.
- Fixed duplicate messages caused by receiving the same message from both the POST response and realtime SSE.
- Chat rendering now deduplicates using the server's message ID.
- The message composer stays inside the chat layout; the message list is the scrolling region.
- The typing box grows only to a safe maximum height, then scrolls internally.


NEXO v3 — DEAD SIGNAL MULTIPLAYER + MOBILE
- Added DEAD SIGNAL, a 2D co-op multiplayer game for up to 6 NEXO friends.
- Create lobbies, invite friends, accept/decline game invites, ready up, start rounds, or join with a 5-character lobby code.
- The server owns player movement, collision, signal shards, corruption entities, the timer, and win/loss state.
- NEXO uses its existing authenticated EventSource connection for server -> client game snapshots and same-origin POST requests for client movement input, so this build keeps zero extra npm dependencies.
- Game simulation runs server-side at 20 Hz, snapshots are sent about 10 Hz, while the browser renders with requestAnimationFrame for smooth interpolation.
- Desktop controls: WASD/Arrow keys. Space activates Pulse.
- Mobile controls: pointer-event virtual joystick + Pulse button with touch-action handling.
- Mobile site pass: bottom navigation rail, responsive browser chrome, touch-sized controls, mobile chat layout, compact music controls, safe-area spacing, responsive cards and overlays.
- Existing persistent account, friend, DM, group/channel, profile, music, and theme data remain in the same NEXO v2 SQLite database location.

MULTIPLAYER NOTE
Players still need to use the SAME running NEXO server/community to see each other, receive game invites, and play together. Active game lobbies are intentionally temporary and reset if the server restarts; account/friend/chat/music data remain persistent.


NEXO v3.1 VISIBILITY FIX
- DEAD SIGNAL is now shown as a large game card directly inside the Games tab.
- Clicking the card opens DEAD SIGNAL; there is a Back to Games button.
- Chat's typing bar now lives outside the scrolling conversation panel, so it stays visible.
- The composer is disabled until a friend/group is selected, then becomes active.
- Mobile keyboard handling now uses the browser Visual Viewport height when available.
- Public HTML/CSS/JS now use no-store while NEXO is in active development, preventing old cached JS/CSS from mixing with a newer build.


DEAD SIGNAL v3.2 LOBBY POLISH
- Only the lobby host can start a round. The host can start whenever they choose; Ready is an informational squad status rather than a hard gate.
- Rebuilt the lobby as a Fortnite-style squad presentation with six glowing player pads.
- Added five account-persistent animal skins: Byte Fox, Neon Frog, Null Cat, Cache Raccoon, and Ping Axolotl.
- Character art and the DEAD SIGNAL launcher icon were developed from the supplied simple humanoid reference and refined with Higgsfield. The primary game art uses the Higgsfield-generated cutouts; optimized local fallback PNGs are bundled for reliable local/LAN play.
- Added live squad chat inside a running match using NEXO's authenticated realtime event stream. Game-lobby chat is temporary and resets with the lobby/server; normal NEXO DMs/groups remain persistent in SQLite.
- Skin choice is stored per NEXO account in SQLite without changing the existing account/friends/messages/music data path.
- Lobby and game UI received desktop/mobile responsive polish.


NEXO v4 — DEAD SIGNAL DAY 2
- Player character is now the player's NEXO profile picture; animal skins were removed from gameplay.
- Endless floor progression: every cleared floor creates a fresh medium-sized randomized map.
- Random floor objectives: terminals, signal cores, and enemy-clear tasks. Complete both tasks to unlock the exit.
- Persistent credits and permanent upgrades: Backpack Space, Speed, Stamina, Health.
- Loot backpack with Scrap, Batteries, Data Drives, Gold Modules, and Glitch Crystals. Sell between floors for credits.
- Weapons: Pulse Pistol, Scrap Rifle, Signal Sword. Weapon pickups spawn in levels.
- Player health bar, stamina/sprinting, backpack HUD, weapon HUD, task tracker, and enemy health bars.
- Real PNG texture assets for floor, walls, loot, enemies, tasks, exit, and weapons.
- Enemies use grid pathfinding plus collision-tested movement so they navigate corridors instead of clipping through walls.
- Host starts Floor 1 and every next floor, giving the squad time to sell and upgrade between runs.
- Mobile controls include joystick, Sprint, Grab/Use, and Attack.


NEXO v4.2 — NATIVE DEAD SIGNAL REBUILD
- DEAD SIGNAL runs directly inside NEXO; there is no external hosted-game iframe.
- All floor, wall, loot, objective, enemy, gun, and sword textures are local PNG files.
- Every level creates a new medium 40x24 procedural room/corridor map.
- Level count is endless; the host controls starting each floor.
- The player character is only the user's NEXO profile picture.
- Loot fills a backpack and can be sold between floors for persistent credits.
- Persistent upgrades: Backpack Space, Speed, Stamina, Health.
- Weapons: Pulse Pistol, Scrap Rifle, Signal Sword.
- Health and stamina bars are included.
- Two randomized tasks must be completed before the exit opens.
- Enemy navigation uses pathfinding, radius wall collision, 6px movement substeps, and anti-stuck correction.
