import Base
import ../../../native/client.bend as Client
import ../../../native/frame.bend as Frame
import ../../../native/pointer.bend as Pointer

# The client's own look, end to end, with the camera's yaw printed after every tick.
#
# The window, the grab, the host pointer, the tick and the fold are the client's: this file
# only bounds the loop and reads the pose back. What it prints is therefore what a player's
# camera did for the mouse travel a driver produced, on whichever pointer the client chose,
# and the first line says which one that was.

# The yaw in ten-thousandths of a radian, so the print is integer-only.
def signed(+value: F32) -> String:
  Bool.pick(String, F32.is_lt(value, 0.0), "-", "") ++ U32.show(F32.to_u32(F32.abs(value)))

def yaw_of(state: Client.Client) -> F32:
  Client.Client{player, +pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = state
  Frame.yaw_of(pose)

def said(next: Maybe<Client.Client>) -> IO(Maybe<Client.Client>):
  match next:
    case None{}:
      IO.pure(Maybe<Client.Client>, None{})
    case Some{+state}:
      do IO<Maybe<Client.Client>>:
        line : Unit <- IO.print("yaw=" ++ signed(F32.mul(yaw_of(state), 10000.0)))
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

def hosted_text(hosted: Bool) -> String:
  Bool.pick(String, hosted, "host", "display")

def run.hosted(state: Client.Client, +hosted: Bool) -> IO(Unit):
  do IO<Unit>:
    line : Unit <- IO.print("pointer=" ++ hosted_text(hosted))
    window : Window <- Client.opened(128)
    frames(900n, window, Client.hosting(state, hosted))

# Fifteen seconds at the runtime's 60 Hz pacing, at the client's default size, opening the
# host's pointer before the window as the client does.
def main() -> IO(Unit):
  do IO<Unit>:
    state : Client.Client <- Client.start(Client.size_128())
    opened : U32 <- Pointer.host_open(Client.title())
    run.hosted(state, U32.is_eq(opened, 1))
