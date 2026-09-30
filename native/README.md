# Native Bend feasibility slice

This is a bounded **prototype**, not the complete game. It draws a 16×16
world-derived slice into a native window, moves a cursor with WASD/arrows,
edits one cell with E, and saves/reloads that edit on restart. Its two-byte
save file is **not compatible** with browser or multiplayer saves. The 3D
renderer, player physics and network protocol in the sibling probe directories
are not yet wired into `main.bend`.

On Linux or macOS with a graphical display and a C compiler, use the pinned
Bend 2.0.32 CLI to build and run:

```bash
bash scripts/bootstrap-native-bend.sh   # once; uses local Bun to build Bend
.tools/bend-local/bin/bend native/main.bend -o .tools/bend-local/bin/bend2craft-native
.tools/bend-local/bin/bend2craft-native
```

On Windows, run these commands **inside WSL** with X11/WSLg configured. A
desktop-visible session and a macOS build have not yet been verified in this
repository. The
isolated Xvfb regression needs `Xvfb`, `xdotool` and Python 3:

```bash
bash native/window-probe/smoke.sh
```

The smoke compiles the executable, drives real X11 keys, reads framebuffer
pixels, checks the edit after a process restart and uses an ignored temporary
directory for its save. The native CPU benchmark can be repeated with
`bash native/bench-probe/run.sh`; the 32×32 perspective-render benchmark is
`bash native/voxel-probe/run.sh`. Neither measures production game FPS.
