"""Architecture isolation test for provider packages.

Uses Python's AST parser to inspect all provider implementations under
``backend/core/providers/``. Enforces the architectural invariant that provider
integrations (e.g. tmdb, igdb, fanart, etc.) MUST NEVER import from another
provider. The only cross-provider dependency allowed is ``core.providers.framework``.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings as django_settings
from django.test import SimpleTestCase

# Infrastructure modules under core.providers permitted during transition
ALLOWED_COMMON_MODULES = {
    "framework",
    "base",
    "types",
    "metrics",
    "circuit_breaker",
    "api_cache",
}


@dataclass(frozen=True)
class ImportViolation:
    """Represents an illegal cross-provider import detected by AST analysis."""

    source_file: str
    source_provider: str
    target_provider: str
    line_number: int
    statement: str

    def __str__(self) -> str:
        return (
            f"Isolation violation in {self.source_file}:{self.line_number} — "
            f"Provider '{self.source_provider}' illegally imports from "
            f"provider '{self.target_provider}': `{self.statement}`"
        )


def analyze_file_imports(
    file_path: Path,
    source_provider: str,
    all_known_providers: set[str],
    source_code: str | None = None,
) -> list[ImportViolation]:
    """Inspect AST of a Python file for illegal cross-provider imports.

    Args:
        file_path: Path to the Python file.
        source_provider: Provider name owning this file (e.g. 'tmdb').
        all_known_providers: Set of all registered/discovered provider slugs.
        source_code: Optional code string (for testing without disk I/O).

    Returns:
        List of ImportViolation instances found in this file.
    """
    if source_code is None:
        source_code = file_path.read_text(encoding="utf-8")

    tree = ast.parse(source_code, filename=str(file_path))
    violations: list[ImportViolation] = []

    for node in ast.walk(tree):
        # 1. Check `import x.y.z`
        if isinstance(node, ast.Import):
            for alias in node.names:
                imported = alias.name
                parts = imported.split(".")
                # Check import of form `core.providers.<provider>`
                if len(parts) >= 3 and parts[0] == "core" and parts[1] == "providers":
                    target_provider = parts[2]
                    if (
                        target_provider != source_provider
                        and target_provider not in ALLOWED_COMMON_MODULES
                        and (target_provider in all_known_providers or len(parts) >= 3)
                    ):
                        violations.append(
                            ImportViolation(
                                source_file=str(file_path),
                                source_provider=source_provider,
                                target_provider=target_provider,
                                line_number=node.lineno,
                                statement=f"import {imported}",
                            )
                        )

        # 2. Check `from x.y import z`
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            parts = module.split(".")

            # Direct import from another provider module e.g. `from core.providers.igdb import ...`
            if len(parts) >= 3 and parts[0] == "core" and parts[1] == "providers":
                target_provider = parts[2]
                if (
                    target_provider != source_provider
                    and target_provider not in ALLOWED_COMMON_MODULES
                ):
                    imported_names = ", ".join(alias.name for alias in node.names)
                    violations.append(
                        ImportViolation(
                            source_file=str(file_path),
                            source_provider=source_provider,
                            target_provider=target_provider,
                            line_number=node.lineno,
                            statement=f"from {module} import {imported_names}",
                        )
                    )

            # Import from parent e.g. `from core.providers import igdb`
            elif module == "core.providers":
                for alias in node.names:
                    target_provider = alias.name
                    if (
                        target_provider != source_provider
                        and target_provider not in ALLOWED_COMMON_MODULES
                        and target_provider in all_known_providers
                    ):
                        violations.append(
                            ImportViolation(
                                source_file=str(file_path),
                                source_provider=source_provider,
                                target_provider=target_provider,
                                line_number=node.lineno,
                                statement=f"from core.providers import {alias.name}",
                            )
                        )

            # Relative import e.g. `from ..igdb import client` inside tmdb subpackage
            elif node.level == 2:
                # Relative to `core.providers`
                target_provider = parts[0] if parts and parts[0] else ""
                if not target_provider and node.names:
                    for alias in node.names:
                        if (
                            alias.name in all_known_providers
                            and alias.name != source_provider
                            and alias.name not in ALLOWED_COMMON_MODULES
                        ):
                            violations.append(
                                ImportViolation(
                                    source_file=str(file_path),
                                    source_provider=source_provider,
                                    target_provider=alias.name,
                                    line_number=node.lineno,
                                    statement=f"from .. import {alias.name}",
                                )
                            )
                elif (
                    target_provider
                    and target_provider in all_known_providers
                    and target_provider != source_provider
                    and target_provider not in ALLOWED_COMMON_MODULES
                ):
                    violations.append(
                        ImportViolation(
                            source_file=str(file_path),
                            source_provider=source_provider,
                            target_provider=target_provider,
                            line_number=node.lineno,
                            statement=f"from ..{module} import ...",
                        )
                    )

    return violations


def discover_provider_files(
    providers_dir: Path,
) -> tuple[dict[str, list[Path]], set[str]]:
    """Scan the providers directory and map each provider to its python files."""
    provider_files: dict[str, list[Path]] = {}
    known_providers: set[str] = set()

    for item in providers_dir.iterdir():
        if item.name.startswith((".", "_")):
            continue

        # Subdirectory provider package (e.g. core/providers/tmdb/)
        if item.is_dir() and item.name not in ALLOWED_COMMON_MODULES and item.name != "tests":
            provider_slug = item.name
            known_providers.add(provider_slug)
            py_files = [p for p in item.rglob("*.py") if not p.name.startswith(".")]
            provider_files[provider_slug] = py_files

        # Single-file provider module (e.g. core/providers/tmdb.py)
        elif item.is_file() and item.suffix == ".py":
            stem = item.stem
            if stem not in ALLOWED_COMMON_MODULES and stem != "__init__":
                known_providers.add(stem)
                provider_files.setdefault(stem, []).append(item)

    return provider_files, known_providers


class ProviderIsolationArchitectureTests(SimpleTestCase):
    """AST architecture tests asserting zero cross-provider imports."""

    def test_ast_scanner_detects_illegal_direct_import(self) -> None:
        code = "from core.providers.igdb import IGDBClient\n"
        violations = analyze_file_imports(
            file_path=Path("core/providers/tmdb/client.py"),
            source_provider="tmdb",
            all_known_providers={"tmdb", "igdb", "steamgrid"},
            source_code=code,
        )
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].source_provider, "tmdb")
        self.assertEqual(violations[0].target_provider, "igdb")

    def test_ast_scanner_detects_illegal_parent_import(self) -> None:
        code = "from core.providers import igdb\n"
        violations = analyze_file_imports(
            file_path=Path("core/providers/tmdb/client.py"),
            source_provider="tmdb",
            all_known_providers={"tmdb", "igdb", "steamgrid"},
            source_code=code,
        )
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].target_provider, "igdb")

    def test_ast_scanner_permits_framework_import(self) -> None:
        code = """
from core.providers.framework import (
    BaseProviderClient,
    ProviderCapability,
    ProviderManifest,
    register_provider,
)
"""
        violations = analyze_file_imports(
            file_path=Path("core/providers/tmdb/client.py"),
            source_provider="tmdb",
            all_known_providers={"tmdb", "igdb", "steamgrid"},
            source_code=code,
        )
        self.assertEqual(violations, [])

    def test_live_providers_directory_has_zero_cross_provider_imports(self) -> None:
        base_dir = Path(getattr(django_settings, "BASE_DIR", Path.cwd()))
        providers_dir = base_dir / "core" / "providers"

        if not providers_dir.is_dir():
            self.skipTest(f"Providers directory not found at {providers_dir}")

        provider_files, all_providers = discover_provider_files(providers_dir)

        all_violations: list[ImportViolation] = []
        for provider_slug, files in provider_files.items():
            for file_path in files:
                violations = analyze_file_imports(
                    file_path=file_path,
                    source_provider=provider_slug,
                    all_known_providers=all_providers,
                )
                all_violations.extend(violations)

        if all_violations:
            report = "\n".join(str(v) for v in all_violations)
            self.fail(
                "Cross-provider imports detected! Only core.providers.framework is allowed:\n"
                f"{report}"
            )
