#!/usr/bin/env python3
"""Generate program_landings/auth-config.js from CloudFormation outputs."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate auth-config.js from CloudFormation outputs.",
    )
    parser.add_argument("--stack-name", required=True, help="CloudFormation stack name")
    parser.add_argument("--region", required=True, help="AWS region for the stack")
    parser.add_argument("--profile", help="Optional AWS CLI profile")
    parser.add_argument(
        "--output",
        default="program_landings/auth-config.js",
        help="Path to the generated auth config file",
    )
    return parser.parse_args()


def _load_stack_outputs(stack_name: str, region: str, profile: str | None) -> dict[str, str]:
    command = [
        "aws",
        "cloudformation",
        "describe-stacks",
        "--stack-name",
        stack_name,
        "--region",
        region,
        "--query",
        "Stacks[0].Outputs",
        "--output",
        "json",
    ]
    if profile:
        command.extend(["--profile", profile])

    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("AWS CLI is required to generate auth-config.js") from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        raise RuntimeError(
            f"Failed to describe stack {stack_name}: {stderr or exc}",
        ) from exc

    outputs = json.loads(completed.stdout)
    return {
        output["OutputKey"]: output["OutputValue"]
        for output in outputs
        if "OutputKey" in output and "OutputValue" in output
    }


def _render_config(region: str, user_pool_client_id: str) -> str:
    return (
        "window.HALT_AUTH_CONFIG = Object.freeze({\n"
        f'  cognitoRegion: {json.dumps(region)},\n'
        f'  userPoolClient: {json.dumps(user_pool_client_id)},\n'
        "});\n"
    )


def main() -> int:
    args = _parse_args()
    outputs = _load_stack_outputs(args.stack_name, args.region, args.profile)
    user_pool_client_id = outputs.get("UserPoolClientId", "").strip()
    if not user_pool_client_id:
        print(
            "CloudFormation output UserPoolClientId was not found.",
            file=sys.stderr,
        )
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        _render_config(args.region, user_pool_client_id),
        encoding="utf-8",
    )
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())