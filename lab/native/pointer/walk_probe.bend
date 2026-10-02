import Base
import ../../../world/player.bend as Player
import ../../../native/client.bend as Client
import ../../../native/frame.bend as Frame
import ../../../native/player.bend as PlayerProbe

# The client's own loop with the player's window cell and the region's first chunk printed
# after every tick, so a driver that holds a key can read whether the region followed.
#
# The player starts fifteen cells east of the spawn, outside the village house the spawn is
# in, so a held `W` walks north across open ground toward the world's origin and past it.
# Everything else is the client's: its window, tick, collision region and view.

def cell_text(+value: F32) -> String:
  U32.show(F32.to_u32(F32.floor(value)))

def line(state: Client.Client) -> String:
  Client.Client{player, pose, keys, hosted, edits, region, path, world, size, bag, +home, clock, dig} = state
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = player
  "cell=" ++ cell_text(x) ++ "," ++ cell_text(y) ++ "," ++ cell_text(z)
    ++ " home=" ++ Nat.show(Frame.home_x(home)) ++ "," ++ Nat.show(Frame.home_z(home))

def said(next: Maybe<Client.Client>) -> IO(Maybe<Client.Client>):
  match next:
    case None{}:
      IO.pure(Maybe<Client.Client>, None{})
    case Some{+state}:
      do IO<Maybe<Client.Client>>:
        printed : Unit <- IO.print(line(state))
        return Some{state}

def tick(events: List<&1, Event>, state: Client.Client) -> IO(Maybe<Client.Client>):
  do IO<Maybe<Client.Client>>:
    next : Maybe<Client.Client> <- Client.tick.events(events, state)
    said(next)

def app() -> App<Client.Client>:
  App{Client.view, tick}

def frames(fuel: Nat, window: Window, +state: Client.Client) -> IO(Unit):
  match fuel:
    case 0n:
      Window.close(window)
    case 1n+f:
      do IO<Unit>:
        held : Window <- Client.grabbed(window)
        App.step(Client.Client, app(), held, state, w => s => frames(f, w, s))

def moved(state: Client.Client) -> Client.Client:
  Client.Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = state
  Client.Client{PlayerProbe.create_player(40n, 25n, 14n), pose, keys, hosted, edits, region,
    path, world, size, bag, home, clock, dig}

# Twenty seconds at the runtime's 60 Hz pacing.
def main() -> IO(Unit):
  do IO<Unit>:
    state : Client.Client <- Client.start(Client.size_128())
    window : Window <- Client.opened(128)
    frames(1200n, window, moved(state))
