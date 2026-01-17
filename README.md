# Optics Sandbox — Serverless Ray Optics

Lightweight, static web app that simulates rays interacting with mirrors, lenses, and beam splitters.

Quickstart

- Open `index.html` in a browser (Chrome/Edge/Firefox). For full file security, run a simple static server in the folder:

  python -m http.server 8000
  open http://localhost:8000

Features

- Drag components: Light Sources, Lenses (thin, paraxial approx), Mirrors (flat), Beam Splitters
- Light sources let you set the number of beams, central direction, and angle spread (even or random distribution)
- Simple ray tracing: reflection, thin-lens paraxial refraction approximation, partial reflection/transmission for splitters
- Export a PNG of the current canvas
- Pan and zoom the canvas (middle mouse button or hold Space + drag, mouse wheel to zoom)
- Snap-to-grid and configurable grid size
- Autosave to localStorage and Import/Export JSON for scenes
- History with Undo/Redo and a visual history list
- Optionally use a "Thick" lens model (spherical surfaces) with refractive index, radii, and thickness

Notes & limitations

- This is a client-only demo using a paraxial thin-lens approximation; it is not a full wave-optics simulator.
- Performance depends on ray count and recursion depth; reduce `Beams` or `Max depth` if the UI becomes slow.

License: MIT
