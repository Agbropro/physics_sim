# Gravity Engine Bug Log

This document tracks the mathematical bugs discovered and fixed in the physics engine.

## 1. The 60x Slow Motion Spin (Angular Impulse vs Acceleration)
**The Bug:** Objects rotated 60 times slower than they should when bouncing off the ground.
**The Cause:** The engine correctly calculated the impact force as an instant "Angular Impulse" (a sudden burst of spin). However, it mislabeled the variable as `alpha` (Angular Acceleration). Because it thought it was an acceleration, it multiplied it by `dt` (Delta Time).
**Numerical Example:**
* An object hits the ground hard, generating an instant spin of `60 degrees/second`.
* The code accidentally multiplies this by the frame time (`dt = 0.01667 seconds`).
* Result: `60 * 0.01667 = 1 degree/second`. 
* The object tumbled at 1/60th of its actual speed.

## 2. The Flat Surface Jiggle
**The Bug:** A perfectly flat rectangle hitting a perfectly flat floor would vibrate endlessly left and right.
**The Cause:** The `_lowest_contact` function used Python's `max()` to find the lowest point. If a flat surface hits the floor, two corners hit the floor at the exact same time. `max()` just picks the first one it finds in the array.
**Numerical Example:**
* A 100px wide box lands flat. Both the left (-50px) and right (+50px) corners are at `Y = 0`.
* `max()` picks the left corner.
* The engine thinks the box hit a rock on its far left side, applying massive torque to flip it to the right.
* Next frame, the right side hits the ground. It applies massive torque to flip it left. Infinite jiggle.
* **The Fix:** Collect *all* points touching the floor and average them. `(-50 + 50) / 2 = 0`. The impact is centered, generating 0 torque.

## 3. The Euler Beanbag Glitch (Zero Torque)
**The Bug:** When Restitution was set to `0.0` (like a wet beanbag), objects would slide weirdly instead of tumbling when hitting their corners.
**The Cause:** The code applied the bounce modifier *before* it calculated the torque for spinning.
**Numerical Example:**
* A box falls at `100 px/s`.
* It hits the ground. `Restitution = 0`.
* The code calculates the bounce: `New Velocity = 100 * 0 = 0 px/s`.
* *Then* the code calculates torque: `Torque = Mass * Velocity`.
* `Torque = Mass * 0 = 0`.
* Because it calculated torque *after* removing the bounce velocity, it deleted the crash impact entirely.

## 4. The Verlet Frozen Lean (Resting Halfway)
**The Bug:** In Verlet mode, a box falling on its corner would just stop halfway and freeze in the air instead of tipping over flat.
**The Cause:** Verlet calculates velocity by looking at movement `(Current Y - Previous Y)`. The engine pushed the object out of the floor to prevent it falling through, but then checked its speed *after* it pushed it.
**Numerical Example:**
* Box falls into the ground. `Previous Y = 500`. `Current Y = 510` (inside the floor).
* Engine corrects the collision: Pushes `Current Y` back up to `500`.
* Engine then calculates impact speed: `(Current Y - Previous Y) = (500 - 500) = 0`.
* The engine assumes the box was already resting gently on the floor (Speed = 0), applies 0 torque, and leaves it frozen at an angle.
* **The Fix:** Calculate the impact speed *before* pushing the box out of the floor!

## 5. The Verlet Pole Vault (Fake Bounciness)
**The Bug:** Tall objects like an `I` would hit the ground and aggressively launch themselves into the sky, even with 0 restitution.
**The Cause:** If the box rotated heavily, a corner would swing deep into the ground. The engine aggressively teleported the `Current Y` upwards to fix it, but forgot to teleport the `Previous Y`.
**Numerical Example:**
* The corner swings into the ground: `Previous Y = 540`, `Current Y = 550` (inside the floor).
* Engine teleports the corner out of the floor: `Current Y` becomes `500`.
* Verlet calculates the new velocity for the next frame: `(Current Y - Previous Y) = (500 - 540) = -40`.
* Negative Y means UP. The engine accidentally converted the collision teleportation into a massive `40 px/s` upward launch velocity!
* **The Fix:** When teleporting `Current Y` up by 50 pixels, also teleport `Previous Y` up by 50 pixels. Velocity remains mathematically untouched!
