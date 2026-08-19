# Gravity Physics Simulator

A 2D rigid-body physics simulator built with a React/Vite frontend and a Python (FastAPI/NumPy) backend. The application allows users to draw complex primitive shapes (Rectangles, Circles, Polygons) on a canvas, group them into rigid bodies, and simulate their physics behavior under gravity.

## Features
- **Interactive Canvas Editor:** Draw, move, and edit vertices of primitive shapes.
- **Center of Mass Calculation:** Automatically calculates the joint Center of Mass for overlapping grouped shapes using 2D mass arrays.
- **Physics Solvers:** Compare the stability and behavior of Euler vs. Verlet integration methods in real-time.
- **Customizable Physics:** Tweak gravity, air resistance (velocity retention), restitution (bounciness), ground friction, and angular damping on the fly.

---

## Technical Architecture

The frontend is a React application that captures geometry data and renders the physics playback. The backend is a Python physics engine that calculates off-center ground collisions, rotational torques, and integration paths.

### Frontend Simulation Loop Snippet
The frontend plays back the physics pre-calculated by the Python engine using a highly optimized `requestAnimationFrame` loop, translating and rotating the original vectors around their simulated Center of Mass:

```tsx
// frontend/src/components/DrawingCanvas.tsx
// Gravity playback mode rendering
for (const body of simFrame.bodies) {
  const initBody = initialFrame.bodies.find(b => b.name === body.name);
  if (!initBody) continue;

  const ids = body.name.split('+');
  for (const shape of shapes) {
    if (!ids.includes(shape.id)) continue;

    // For playback, translate and rotate shape around its CURRENT center of mass,
    // then shift it backwards by its INITIAL center of mass so its original
    // absolute coordinates become correctly offset from the origin!
    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.rotate(body.angle);
    ctx.translate(-initBody.x, -initBody.y);

    const fillOpacity = body.resting ? 0.15 : 0.8;
    drawShape(shape, SHAPE_COLOR, 1, fillOpacity);
    
    ctx.restore();
  }
}
```

---

## Future Development & Limitations

### Object-to-Object Collisions
Currently, the physics engine only supports **Ground Collisions** (objects colliding with the floor plane). 

**Planned Roadmap:** Implement the Separating Axis Theorem (SAT) or distance constraints to allow multiple free-falling rigid bodies to collide, stack, and transfer momentum to each other.

### Current Limitations
1. **Density (`rho`) vs Falling:** Density currently scales mass and inertia equally. Since only ground collisions exist, density mathematically cancels out and does not affect the simulation visually. It will become critical once object-to-object collisions are implemented.
2. **Fixed Floor Plane:** The ground is a flat horizontal plane. Sloped terrain or dynamic ground is not yet supported.
3. **Rest Detection Jitter:** Highly complex overlapping polygons may occasionally take slightly longer to reach a perfectly "resting" state under Euler integration compared to Verlet.

---

## Running the Project

### Backend
```bash
pip install -r requirements.txt
python3 -m src.delivery.api
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Deploying to Vercel

This repository deploys as one Vercel project: the Vite frontend is served at
the site root and the FastAPI application is served from `/api`.

1. Push the repository to GitHub, GitLab, or Bitbucket and import it into
   Vercel.
2. Keep the Vercel **Root Directory** set to the repository root (`.`). The
   checked-in `vercel.json` supplies the build command and output directory.
3. Do not set `VITE_API_URL` in Vercel. Leaving it unset makes the frontend use
   the same domain for `/api` requests.
4. Deploy, then verify `https://YOUR_DOMAIN/api/health` returns
   `{"status":"ok"}`.
5. In **Project Settings → Domains**, assign the custom domain to the
   Production environment if it is not already assigned.

Optional `VITE_*` appearance and canvas settings from `frontend/.env.example`
can be added under **Project Settings → Environment Variables**. After changing
a build-time `VITE_*` variable, redeploy the project.
