# Physics Equations Reference

This document outlines the core physics formulas used to drive the rigid body simulation engine.

## 1. The Crash Impact (Normal Impulse)
When an object hits the ground, it doesn't just experience a force—it experiences an **Impulse** ($J$). Impulse is a massive force applied over a tiny fraction of a second. It represents the total change in momentum.

When an object bounces, its velocity changes from heading down ($v$) to heading up ($-e \cdot v$). The total change in velocity is $v + e \cdot v = v(1 + e)$.

$$ J = m \cdot v \cdot (1 + e) $$

* **$J$**: Normal Impulse (Crash Impact)
* **$m$**: Mass of the object
* **$v$**: Velocity upon impact
* **$e$**: Coefficient of Restitution (Bounciness)

## 2. Tipping Over (Angular Impulse / Torque)
If an object hits the ground off-center (like on a corner), that crash impact ($J$) pushes up on that specific corner, causing the object to spin. The amount of spin depends on how far the corner is from the Center of Mass.

$$ \Delta \omega = \frac{r \times J}{I} $$

* **$\Delta \omega$**: Change in Angular Velocity (How much faster it spins)
* **$r$**: Lever Arm (Horizontal distance from Center of Mass to the corner hitting the ground)
* **$J$**: Normal Impulse (Calculated above)
* **$I$**: Moment of Inertia (Resistance to spinning)

## 3. Euler Integration
Euler explicitly tracks Velocity ($v$) as a separate variable and updates Position ($x$) based on it.

**Translation:**
$$ v_{new} = v + (g \cdot dt) $$
$$ x_{new} = x + (v_{new} \cdot dt) $$

**Rotation:**
$$ \omega_{new} = \omega \cdot \text{damping} $$
$$ \theta_{new} = \theta + (\omega_{new} \cdot dt) $$

## 4. Verlet Integration
Verlet does *not* store a Velocity variable. It derives Implicit Velocity ($v_{implicit}$) mathematically by looking at how far the object moved last frame.

**Implicit Velocity:**
$$ v_{implicit} = \frac{x_{current} - x_{previous}}{dt} $$

**Translation:**
$$ x_{new} = x_{current} + (v_{implicit} \cdot \text{drag}) + (g \cdot dt^2) $$
*(Notice that dt is squared because velocity was never multiplied by dt in the first place!)*

**Rotation:**
$$ \theta_{new} = \theta_{current} + (\theta_{current} - \theta_{previous}) \cdot \text{damping} $$

## 5. Friction & Air Resistance
* **Air Resistance (Drag):** A constant multiplier applied every frame to simulate air thickness.
  $$ v = v \cdot \text{drag} $$
* **Ground Friction:** A multiplier applied *only* when touching the floor to stop sliding.
  $$ v_x = v_x \cdot (1 - \mu) $$
  *(Where $\mu$ is the friction coefficient)*

## 6. Circle Discretization (Performance Optimization)
While True mass and Center of Mass are calculated using mathematically perfect pixel circles, collision detection for perfect curves is computationally extremely expensive. To guarantee 60 FPS, the engine uses **Discretization**.

Circles are secretly converted into 16-sided polygons (`hexadecagons`) exclusively for ground collision checks:
$$ \theta_i = i \times \frac{2\pi}{16} $$
$$ x_i = cx + r \cdot \cos(\theta_i) $$
$$ y_i = cy + r \cdot \sin(\theta_i) $$

* **Why 16 points?** 
  * It provides shallow enough angles ($22.5^\circ$) that the physics engine creates the optical illusion of a perfectly smooth roll. 
  * It minimizes CPU math operations per frame. 
  * The tiny "flat" edges perfectly synergize with the engine's `contact_tolerance` to allow rolling circles to naturally rest and go to sleep without endless jittering.
