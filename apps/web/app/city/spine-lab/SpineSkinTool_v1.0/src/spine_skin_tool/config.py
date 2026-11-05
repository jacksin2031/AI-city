"""严格的本地配置入口；读配置不会创建目录或启动外部服务。"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path, PurePosixPath, PureWindowsPath
import tomllib


class ConfigError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(f"{code}: 設定ファイルの形式と許可範囲を確認してください。")


def read_toml(path: Path) -> dict:
    try:
        with path.open("rb") as stream:
            return tomllib.load(stream)
    except (OSError, tomllib.TOMLDecodeError):
        raise ConfigError("CONFIG_UNREADABLE") from None


def runtime_path(root: Path, value: str) -> Path:
    # Reject both Windows and POSIX absolute paths on every platform.
    if not isinstance(value, str) or "\\" in value or ":" in value:
        raise ConfigError("UNSAFE_PATH")
    relative = PurePosixPath(value)
    if relative.is_absolute() or PureWindowsPath(value).is_absolute() or ".." in relative.parts:
        raise ConfigError("UNSAFE_PATH")
    if len(relative.parts) < 2 or relative.parts[0] != "runtime":
        raise ConfigError("UNSAFE_PATH")
    for parent in (root / value, *(root / value).parents):
        if parent == root:
            break
        if parent.is_symlink() or (hasattr(parent, "is_junction") and parent.is_junction()):
            raise ConfigError("UNSAFE_PATH")
    target = (root / value).resolve()
    runtime = root / "runtime"
    if not runtime.resolve().is_relative_to(root.resolve()) or not target.is_relative_to(runtime.resolve()):
        raise ConfigError("UNSAFE_PATH")
    return target


def merge_known(base: dict, overrides: dict) -> dict:
    result = dict(base)
    for key, value in overrides.items():
        if key not in base or type(value) is not type(base[key]):
            raise ConfigError("UNKNOWN_KEY_OR_TYPE")
        result[key] = merge_known(base[key], value) if isinstance(value, dict) else value
    return result


def positive_int(value: object, maximum: int) -> bool:
    return type(value) is int and 1 <= value <= maximum


def validate_values(values: dict) -> None:
    expected = {
        "server": {"host", "port"},
        "execution": {"mode", "max_active_jobs", "max_model_calls_per_part", "max_total_model_calls", "max_repair_cycles", "paid_api_enabled"},
        "paths": {"work", "data", "output", "cache", "logs"},
        "template": {"size_trial"},
        "spine": {"editor_executable"},
    }
    if set(values) != set(expected):
        raise ConfigError("UNKNOWN_KEY_OR_TYPE")
    for section, fields in expected.items():
        if not isinstance(values[section], dict) or set(values[section]) != fields:
            raise ConfigError("UNKNOWN_KEY_OR_TYPE")
    server, execution = values["server"], values["execution"]
    if server["host"] != "127.0.0.1" or not positive_int(server["port"], 65535):
        raise ConfigError("SERVER_NOT_LOCAL")
    if execution["mode"] != "mock" or execution["paid_api_enabled"] is not False:
        raise ConfigError("REAL_MODE_UNAVAILABLE")
    for name in ("max_active_jobs", "max_model_calls_per_part", "max_total_model_calls", "max_repair_cycles"):
        if not positive_int(execution[name], 100000):
            raise ConfigError("INVALID_EXECUTION_LIMIT")
    if not isinstance(values["spine"]["editor_executable"], str):
        raise ConfigError("UNKNOWN_KEY_OR_TYPE")


def validate_trial(trial: dict) -> None:
    if set(trial) != {"schema_version", "trial", "parts"} or not isinstance(trial["schema_version"], str):
        raise ConfigError("INVALID_TRIAL")
    meta = trial["trial"]
    required_meta = {"id", "revision", "profile", "status", "production_approved", "generation_canvas_status", "spine_geometry_status", "source_reference"}
    if not isinstance(meta, dict) or set(meta) != required_meta:
        raise ConfigError("INVALID_TRIAL")
    if any(not isinstance(meta[key], str) or not meta[key] for key in required_meta - {"production_approved"}):
        raise ConfigError("INVALID_TRIAL")
    if meta["status"] != "EXPERIMENTAL" or meta["production_approved"] is not False:
        raise ConfigError("TRIAL_NOT_PRODUCTION_APPROVED")
    if meta["generation_canvas_status"] != "NOT_SELECTED" or meta["spine_geometry_status"] != "UNMEASURED":
        raise ConfigError("TRIAL_CALIBRATION_UNAVAILABLE")
    parts = trial["parts"]
    required = {f"{part}_{side}" for part in ("HAIR", "BODY", "ARM", "LEG") for side in ("FRONT", "BACK")} | {"BLANK"}
    if not isinstance(parts, dict) or set(parts) != required:
        raise ConfigError("INVALID_PART_SET")
    for part in parts.values():
        if not isinstance(part, dict) or set(part) != {"width", "height"}:
            raise ConfigError("INVALID_PART_SIZE")
        # Decode/resource limit, not a visual-quality tolerance or chosen size.
        if any(not positive_int(part[axis], 16384) for axis in ("width", "height")):
            raise ConfigError("INVALID_PART_SIZE")


@dataclass(frozen=True)
class ToolConfig:
    root: Path
    values: dict
    trial: dict
    trial_sha256: str
    resolved_paths: dict[str, Path]

    def summary(self) -> dict:
        # Deliberately exclude machine editor paths and arbitrary local values.
        return {
            "mode": self.values["execution"]["mode"],
            "paid_api_enabled": self.values["execution"]["paid_api_enabled"],
            "size_trial": self.trial,
            "size_trial_sha256": self.trial_sha256,
            "paths": self.values["paths"],
        }


def load_config(root: Path | None = None) -> ToolConfig:
    root = (root or Path(__file__).resolve().parents[2]).resolve()
    base = read_toml(root / "runtime/config/defaults.toml")
    local = root / "runtime/config/local.toml"
    values = merge_known(base, read_toml(local)) if local.exists() else base
    validate_values(values)
    paths = {key: runtime_path(root, value) for key, value in values["paths"].items()}
    for key, path in paths.items():
        if not path.is_relative_to(root / "runtime" / key):
            raise ConfigError("PATH_OUTSIDE_IGNORED_AREA")
    protected = [root / "runtime/python", root / "runtime/js", root / "runtime/config", root / "runtime/bin", root / "runtime/secrets", root / "runtime/vendor-untracked"]
    destinations = list(paths.values())
    for index, path in enumerate(destinations):
        for other in destinations[index + 1:] + protected:
            other = other.resolve()
            if path.is_relative_to(other) or other.is_relative_to(path):
                raise ConfigError("OVERLAPPING_RUNTIME_PATHS")
    trial_path = runtime_path(root, values["template"]["size_trial"])
    if not trial_path.is_relative_to(root / "runtime/config") or trial_path.suffix != ".toml":
        raise ConfigError("INVALID_TRIAL_PATH")
    trial = read_toml(trial_path)
    validate_trial(trial)
    return ToolConfig(root, values, trial, hashlib.sha256(trial_path.read_bytes()).hexdigest(), paths)
