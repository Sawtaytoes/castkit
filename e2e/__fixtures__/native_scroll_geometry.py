"""Run production window geometry without importing its optional transport dependencies."""

import ast
import json
import math
import sys
from pathlib import Path

source = Path("device-client/remote-display/scroll_window.py")
module = ast.parse(source.read_text())
names = {"WINDOW_ALIGN", "MIN_WINDOW_ROWS", "StitchRefusedError", "plan_window"}
geometry = ast.Module(
    body=[
        node
        for node in module.body
        if getattr(node, "name", None) in names
        or (
            isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id in names for target in node.targets)
        )
    ],
    type_ignores=[],
)
namespace = {"math": math}
exec(compile(geometry, str(source), "exec"), namespace)
print(json.dumps(namespace["plan_window"](json.loads(sys.argv[1]), 4096)))
