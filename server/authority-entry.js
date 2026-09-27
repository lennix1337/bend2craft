// Bundle entry for the multiplayer authority: the compiled Bend room contract
// and the server's mob simulation (which runs Bend's entity rules), built to
// dist/multiplayer-authority.js so the Node server and the Cloudflare Worker
// can load them without the Bend toolchain.
import Multiplayer from "../world/multiplayer.bend";

export { createMobWorld } from "./mob-world.js";
export default Multiplayer;
