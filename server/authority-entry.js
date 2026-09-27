// Bundle entry for the multiplayer authority: the compiled Bend room contract,
// built to dist/multiplayer-authority.js so the Node server and the Cloudflare
// Worker can load it without the Bend toolchain.
import Multiplayer from "../world/multiplayer.bend";

export default Multiplayer;
