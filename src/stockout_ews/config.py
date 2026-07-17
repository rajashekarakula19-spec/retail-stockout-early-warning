from pathlib import Path

import yaml


def load_config(path: str | Path) -> dict:
    with Path(path).open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)

    project_root = Path(path).resolve().parents[1]
    config["project_root"] = project_root
    config["data_dir"] = (project_root / config["data_dir"]).resolve()
    config["output_dir"] = (project_root / config.get("output_dir", ".")).resolve()
    return config
