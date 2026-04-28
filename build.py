#!/usr/bin/env python3
"""
Assembles a per-state deployable under dist/<state>/program_landings/.

Usage:
    python build.py --state alaska
    python build.py --state arkansas
    python build.py --state dev

Steps:
    1. Load env/env.<state>
    2. Validate COGNITO_CLIENT_ID and API_GATEWAY_URL are non-empty
    3. Clear dist/<state>/ if it exists
    4. Render templates/auth-config.js.j2 → dist/<state>/program_landings/auth-config.js
    5. Copy states/<state>/ tree → dist/<state>/program_landings/
    6. Copy all program_landings/ files (except auth-config.js) → dist/<state>/program_landings/
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

REPO_ROOT = Path(__file__).parent
REQUIRED_VARS = ["COGNITO_CLIENT_ID", "API_GATEWAY_URL"]


def load_env_file(state: str) -> dict:
    env_file = REPO_ROOT / "env" / f"env.{state}"
    if not env_file.exists():
        sys.exit(f"Error: env file not found: {env_file}")

    env_vars = {}
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        env_vars[key.strip()] = value.strip()
    return env_vars


def validate(env_vars: dict, state: str) -> None:
    missing = [var for var in REQUIRED_VARS if not env_vars.get(var)]
    if missing:
        sys.exit(
            f"Error: the following required variables are empty in env/env.{state}:\n"
            + "\n".join(f"  {var}" for var in missing)
        )


def render_auth_config(env_vars: dict, output_path: Path) -> None:
    jinja_env = Environment(
        loader=FileSystemLoader(str(REPO_ROOT / "templates")),
        undefined=StrictUndefined,
    )
    template = jinja_env.get_template("auth-config.js.j2")
    rendered = template.render(
        cognito_region=env_vars["AWS_REGION"],
        cognito_client_id=env_vars["COGNITO_CLIENT_ID"],
        api_gateway_url=env_vars["API_GATEWAY_URL"].rstrip("/"),
    )
    output_path.write_text(rendered)
    print(f"  rendered → {output_path.relative_to(REPO_ROOT)}")


def copy_tree(source: Path, destination: Path) -> None:
    if not source.exists():
        sys.exit(f"Error: source directory not found: {source}")
    shutil.copytree(source, destination, dirs_exist_ok=True)
    print(f"  copied   {source.relative_to(REPO_ROOT)}/ → {destination.relative_to(REPO_ROOT)}/")


def copy_shared_files(destination: Path) -> None:
    source = REPO_ROOT / "program_landings"
    for item in source.iterdir():
        if item.name == "auth-config.js":
            continue
        target = destination / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True)
        else:
            shutil.copy2(item, target)
    print(f"  copied   program_landings/ (shared files) → {destination.relative_to(REPO_ROOT)}/")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build per-state dist/ deployable.")
    parser.add_argument("--state", required=True, help="State name matching env/env.<state>")
    args = parser.parse_args()

    state = args.state
    dist_state = REPO_ROOT / "dist" / state
    output_dir = dist_state / "program_landings"

    print(f"Building state: {state}")

    env_vars = load_env_file(state)
    validate(env_vars, state)

    if dist_state.exists():
        shutil.rmtree(dist_state)
        print(f"  cleared  dist/{state}/")

    output_dir.mkdir(parents=True)

    render_auth_config(env_vars, output_dir / "auth-config.js")
    copy_tree(REPO_ROOT / "states" / state, output_dir)
    copy_shared_files(output_dir)

    print(f"\nBuild complete: dist/{state}/program_landings/")


if __name__ == "__main__":
    main()
