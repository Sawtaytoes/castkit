# Measured queue poster fit

All images use the same local fixture and a 480 × 480 panel. Before is master
51da4be58e433d7670aafdc0b60c08c8a4de63d6. After uses the shared priority layout
selector to maximize contained artwork. Two and three options use full poster
rectangles; four use larger squares when full rectangles would make targets
narrower than 130 pixels. Longer lists keep their scrolling grid. The empty
state is centered and contains only “No matching queues.”

The real-server cases load artwork, verify all choices fit without scrolling,
and exercise both the physical square size and the four named browser windows.
