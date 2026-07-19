# Security Policy

## Supported versions

Security fixes are applied to the latest released minor version while the project is below 1.0.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue for a vulnerability that could cause unintended file writes, path traversal, command execution, or disclosure of repository contents.

Include the affected command or API, a minimal reproduction, the operating system and Node version, and the expected impact. Reports will be acknowledged as soon as practical.

## Autofix trust model

Autofix is opt-in and executes code supplied by installed checks and plugins with the permissions of the current Node process. Install plugins only from sources you trust, review changes after `--fix`, and run untrusted checks in an isolated environment.
