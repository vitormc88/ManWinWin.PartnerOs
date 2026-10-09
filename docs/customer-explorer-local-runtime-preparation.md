# Local compatible runtime preparation — 2026-10-08

User explicitly authorized preparing Docker Desktop for the isolated full recovery test and confirmed company size/revenue meets both free commercial-use thresholds. No purchase, Supabase plan change, production schema write, automatic restart or license acceptance performed.

Readiness checks: Windows 11 Pro x64 build 26200, 15.9 GiB RAM, approximately 139.7 GiB free on C:, Intel i7-8550U with firmware virtualization and SLAT enabled. Hypervisor not yet present; WSL not installed. No existing Docker installation detected. Current Windows account is an Administrators member but this process does not have an elevated token.

Verified official installers downloaded to the ignored `.customer-explorer-preview/tools/docker` directory:

| Installer | Bytes | SHA256 | Signature |
| --- | ---: | --- | --- |
| Docker Desktop 4.94.0 build 241994 | 635493296 | a9814e31049d66156477a86614e83365669677733014ec72f74229623ff3890a | Valid, Docker Inc |
| Microsoft WSL 3.0.1 x64 | 367669248 | 28b1a0d013640a2ac95898ea705fa186e5b4ff767a1c1b49257161bc106599c6 | Valid, Microsoft Corporation |

Docker checksum obtained from its official release notes link; WSL checksum from the official microsoft/WSL GitHub release asset metadata. Downloads were checked against those hashes and Windows Authenticode before any installer execution. An earlier partial WSL download is not verified and must not be used.

The initial `wsl --install --no-distribution --web-download` did not start on the host's built-in WSL stub. Agent-initiated RunAs was cancelled without a visible prompt. Initial user execution without an elevated token failed with MSI Error 1925 / 1603; no success was claimed.

The user then executed the combined helper from an Administrator Command Prompt. Verified installation logs at 20:14 local time show WSL 3.0.1 MSI return code 0 and VirtualMachinePlatform return code 3010 (operation successful, restart required). The result marker is `WSL_MSI=0 VIRTUAL_MACHINE_PLATFORM=3010 NO_AUTOMATIC_REBOOT=true`. The helper checks the official MSI hash and uses `/norestart`; no automatic reboot occurred. Docker installer has not been run and its terms have not been accepted. Do not add docker-users membership, expose a Docker TCP socket, log in to cloud/offload services, enable automatic diagnostics uploads, reboot the host, or accept legally binding terms as part of an unattended follow-up.

Next: user saves open work and manually restarts Windows when convenient. After restart, verify WSL/virtualization readiness, install Docker for this user using WSL2, have the user accept its terms, then verify engine readiness before starting an isolated Supabase recovery environment. Bind local services to loopback, prevent outbound production jobs/notifications and keep private recovery data outside Git/public app assets. PROD remains unchanged.

References:

Post-restart update: host-side `wsl --version` and `wsl --status` completed with exit code 0, WSL 3.0.1 and default version 2. The WSL1 optional-component notice does not block the selected WSL2 backend. Sandboxed WSL status returned access denied; the authorized host-side check resolved that restriction. Docker installer hash and Authenticode were reverified immediately before execution. Per-user installation with `install --user --quiet --backend=wsl-2` completed with exit code 0; installed executable verified under the user's LocalAppData Programs/DockerDesktop. No `--accept-license` flag was supplied. Opened Docker Desktop for the user to review terms; acceptance and engine readiness remain pending. No Supabase restore or PROD modification occurred in this step.

User subsequently confirmed Docker first-run completion. Engine readiness verified: Docker Desktop 4.94.0, Docker Engine 29.8.2, linux/amd64, desktop-linux context. Downloaded official Supabase PostgreSQL image 17.11.0.004; complete database archive recovery and Explorer migration/permission rollback tests passed in a network-none container with no published ports. See the backup preflight document for evidence and remaining release limits. Containers were stopped after each test; PROD remains unchanged.

- https://docs.docker.com/desktop/setup/install/windows-install/
- https://docs.docker.com/desktop/release-notes/
- https://learn.microsoft.com/en-us/windows/wsl/basic-commands
- https://github.com/microsoft/WSL/releases/tag/3.0.1
