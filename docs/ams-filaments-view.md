# AMS Filaments view

AMS Filaments is a dedicated browser view bound to an `ams.v1` channel. The
Bambuddy adapter publishes each selected printer and its AMS units, with slot
colors, material, remaining percentage, optional K calibration, temperature
and humidity. Missing readings remain absent; unknown quantity is not zero.
Offline printers show their last known filament locations.

Choose **Slot cards** for the fleet overview or **Spool rows** for a selected
printer. The saved `layout` setting chooses the initial presentation. At
1280×720 the cards fit three printers with three four-slot units each. Below
900 pixels wide, printer and AMS tabs select one unit so rows remain visible.
Below 450 pixels of content height, slot cards replace rows; roomy rows need
a taller display.

This view has no write controls. Set its access to public to view filament
locations without signing in. The separate channel carries no reader tag UID,
scale state or full spool inventory, and its source rejects actions and camera
media. Printer product images remain available through the source media proxy.
Spool assignment stays in the authorized Filament Spool Scale view.
